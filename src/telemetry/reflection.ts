/**
 * Discovers a gRPC server's services and message types at runtime.
 *
 * The game doesn't ship a .proto, so we ask the server itself via the standard
 * gRPC Server Reflection protocol. If reflection is disabled, fall back to a
 * .proto file (see `loadFromProto`).
 */
import * as grpc from "@grpc/grpc-js";
import { readFileSync } from "node:fs";
import protobuf from "protobufjs";
// Adds Root.fromDescriptor and the FileDescriptorProto type.
import * as descriptor from "protobufjs/ext/descriptor/index.js";

export interface MethodInfo {
	service: string;
	name: string;
	/** gRPC path, e.g. "/sc.telemetry.Telemetry/Subscribe". */
	path: string;
	requestType: protobuf.Type;
	responseType: protobuf.Type;
	requestStream: boolean;
	responseStream: boolean;
}

export interface Discovery {
	root: protobuf.Root;
	services: string[];
	methods: MethodInfo[];
	source: "reflection" | "proto";
}

const reflectionProto = (pkg: string) => `
syntax = "proto3";
package ${pkg};
service ServerReflection {
  rpc ServerReflectionInfo(stream ServerReflectionRequest) returns (stream ServerReflectionResponse);
}
message ServerReflectionRequest {
  string host = 1;
  oneof message_request {
    string file_by_filename = 3;
    string file_containing_symbol = 4;
    ExtensionRequest file_containing_extension = 5;
    string all_extension_numbers_of_type = 6;
    string list_services = 7;
  }
}
message ExtensionRequest { string containing_type = 1; int32 extension_number = 2; }
message ServerReflectionResponse {
  string valid_host = 1;
  ServerReflectionRequest original_request = 2;
  oneof message_response {
    FileDescriptorResponse file_descriptor_response = 4;
    ExtensionNumberResponse all_extension_numbers_response = 5;
    ListServiceResponse list_services_response = 6;
    ErrorResponse error_response = 7;
  }
}
message FileDescriptorResponse { repeated bytes file_descriptor_proto = 1; }
message ExtensionNumberResponse { string base_type_name = 1; repeated int32 extension_number = 2; }
message ListServiceResponse { repeated ServiceResponse service = 1; }
message ServiceResponse { string name = 1; }
message ErrorResponse { int32 error_code = 1; string error_message = 2; }
`;

const REFLECTION_PACKAGES = ["grpc.reflection.v1", "grpc.reflection.v1alpha"];
const reflectionRoot = new protobuf.Root();
for (const pkg of REFLECTION_PACKAGES) protobuf.parse(reflectionProto(pkg), reflectionRoot, { keepCase: true });

/** Serializer/deserializer pair for a protobufjs message type. */
export function codec(type: protobuf.Type) {
	return {
		serialize: (obj: object): Buffer => Buffer.from(type.encode(type.fromObject(obj)).finish()),
		deserialize: (buf: Buffer): Record<string, unknown> =>
			type.toObject(type.decode(buf), { longs: Number, enums: String, defaults: true, oneofs: true }),
	};
}

export async function discover(address: string, timeoutMs = 4000): Promise<Discovery> {
	let lastError: unknown;
	for (const pkg of REFLECTION_PACKAGES) {
		try {
			return await discoverWith(address, pkg, timeoutMs);
		} catch (err) {
			lastError = err;
		}
	}
	throw new Error(`gRPC reflection failed at ${address}: ${errorMessage(lastError)}`);
}

async function discoverWith(address: string, pkg: string, timeoutMs: number): Promise<Discovery> {
	const reqType = reflectionRoot.lookupType(`${pkg}.ServerReflectionRequest`);
	const resType = reflectionRoot.lookupType(`${pkg}.ServerReflectionResponse`);
	const req = codec(reqType);
	const res = {
		deserialize: (buf: Buffer) => resType.toObject(resType.decode(buf), { defaults: false, oneofs: true }) as any,
	};

	const client = new grpc.Client(address, grpc.credentials.createInsecure());
	const call = client.makeBidiStreamRequest(
		`/${pkg}.ServerReflection/ServerReflectionInfo`,
		req.serialize,
		res.deserialize,
	);

	const waiting: Array<{ resolve: (v: any) => void; reject: (e: unknown) => void }> = [];
	call.on("data", (msg) => waiting.shift()?.resolve(msg));
	call.on("error", (err) => {
		while (waiting.length) waiting.shift()!.reject(err);
	});

	const ask = (request: object) =>
		new Promise<any>((resolve, reject) => {
			const timer = setTimeout(() => reject(new Error("reflection request timed out")), timeoutMs);
			waiting.push({
				resolve: (v) => (clearTimeout(timer), resolve(v)),
				reject: (e) => (clearTimeout(timer), reject(e)),
			});
			call.write(request);
		}).then((msg) => {
			if (msg.error_response) throw new Error(msg.error_response.error_message || "reflection error");
			return msg;
		});

	try {
		const list = await ask({ list_services: "" });
		const services: string[] = (list.list_services_response?.service ?? [])
			.map((s: { name: string }) => s.name)
			.filter((n: string) => !n.startsWith("grpc.reflection.") && !n.startsWith("grpc.health."));

		// Collect every file descriptor the services need (including imports).
		const files = new Map<string, any>();
		const addFiles = (msg: any) => {
			for (const bytes of msg.file_descriptor_response?.file_descriptor_proto ?? []) {
				const fdp = (descriptor as any).FileDescriptorProto.decode(bytes);
				if (!files.has(fdp.name)) files.set(fdp.name, fdp);
			}
		};
		for (const svc of services) addFiles(await ask({ file_containing_symbol: svc }));

		for (let guard = 0; guard < 50; guard++) {
			const missing = [...files.values()].flatMap((f) => f.dependency ?? []).filter((d: string) => !files.has(d));
			if (missing.length === 0) break;
			for (const dep of new Set(missing)) {
				try {
					addFiles(await ask({ file_by_filename: dep }));
				} catch {
					// Server may not serve well-known types; record a stub so we stop asking.
					files.set(dep, { name: dep });
				}
			}
		}

		const set = { file: [...files.values()].filter((f) => f.messageType || f.service || f.enumType) };
		const root: protobuf.Root = (protobuf.Root as any).fromDescriptor(set);
		root.resolveAll();
		return { root, services, methods: collectMethods(root, services), source: "reflection" };
	} finally {
		call.end();
		client.close();
	}
}

/**
 * Fallback when reflection is off. Accepts a .proto, or a binary FileDescriptorSet
 * (.protoset / .pb / .desc) such as scripts/extract-schema.mjs writes.
 */
export async function loadFromProto(protoFile: string): Promise<Discovery> {
	let root: protobuf.Root;
	if (/\.(protoset|pb|desc)$/i.test(protoFile)) {
		const set = (descriptor as any).FileDescriptorSet.decode(readFileSync(protoFile));
		root = (protobuf.Root as any).fromDescriptor(set);
		// Well-known imports (google/protobuf/*) the game didn't embed.
		for (const file of set.file ?? []) {
			for (const dep of file.dependency ?? []) {
				const common = (protobuf as any).common.get(dep);
				if (common && !set.file.some((f: any) => f.name === dep)) root.addJSON(common.nested ?? {});
			}
		}
	} else {
		root = await protobuf.load(protoFile);
	}
	root.resolveAll();
	const services: string[] = [];
	const walk = (ns: protobuf.NamespaceBase) => {
		for (const obj of ns.nestedArray) {
			if (obj instanceof protobuf.Service) services.push(obj.fullName.replace(/^\./, ""));
			else if (obj instanceof protobuf.Namespace) walk(obj);
		}
	};
	walk(root);
	return { root, services, methods: collectMethods(root, services), source: "proto" };
}

function collectMethods(root: protobuf.Root, services: string[]): MethodInfo[] {
	const methods: MethodInfo[] = [];
	for (const name of services) {
		const svc = root.lookupService(name);
		for (const m of svc.methodsArray) {
			m.resolve();
			methods.push({
				service: name,
				name: m.name,
				path: `/${name}/${m.name}`,
				requestType: m.resolvedRequestType!,
				responseType: m.resolvedResponseType!,
				requestStream: !!m.requestStream,
				responseStream: !!m.responseStream,
			});
		}
	}
	return methods;
}

/**
 * Methods we're willing to call blindly: read-only by name, and never
 * client-streaming. Anything that looks like it changes game state is skipped.
 */
export function isSafeToCall(m: MethodInfo): boolean {
	if (m.requestStream) return false;
	// Anything named like an action is refused, e.g. TriggerGameAction on 5.0.
	if (/^(trigger|set|execute|send|create|delete|update|remove|start|stop|reset|write|put|post|perform|invoke|apply|activate|toggle|enable|disable)/i.test(m.name)) return false;
	return /^(get|list|read|subscribe|stream|watch|query|fetch|describe)/i.test(m.name) || /stream|telemetry/i.test(m.name);
}

/** Picks the method to feed the plugin: config override, else the most telemetry-looking stream. */
export function pickMethod(methods: MethodInfo[], wanted?: string): MethodInfo | undefined {
	if (wanted) {
		return methods.find((m) => m.path === `/${wanted}` || `${m.service}/${m.name}` === wanted || m.name === wanted);
	}
	const safe = methods.filter(isSafeToCall);
	return (
		safe.find((m) => m.responseStream && /telemetry|state|status/i.test(m.name + m.service)) ??
		safe.find((m) => m.responseStream) ??
		safe.find((m) => /telemetry|state|status|snapshot/i.test(m.name)) ??
		safe[0]
	);
}

export function describeType(type: protobuf.Type, indent = "", seen = new Set<string>()): string {
	if (seen.has(type.fullName)) return `${indent}(recursive ${type.name})\n`;
	seen.add(type.fullName);
	let out = "";
	for (const f of type.fieldsArray) {
		f.resolve();
		const label = f.repeated ? "repeated " : f.map ? "map " : "";
		out += `${indent}${f.name}: ${label}${f.type}\n`;
		if (f.resolvedType instanceof protobuf.Type) out += describeType(f.resolvedType, indent + "  ", new Set(seen));
		else if (f.resolvedType instanceof protobuf.Enum) out += `${indent}  enum { ${Object.keys(f.resolvedType.values).join(", ")} }\n`;
	}
	return out;
}

export function errorMessage(err: unknown): string {
	return err instanceof Error ? err.message : String(err);
}
