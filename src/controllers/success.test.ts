/*
 * Copyright © 2026 Metreeca srl
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

import { describe, expect, it, vi } from "vitest";
import { isProblem, type Problem, success, toProblem } from "./success.js";


describe("isProblem()", () => {

	it.each([
		["type", { type: "about:blank" }],
		["title", { title: "Not Found" }],
		["instance", { instance: "/api/users/123" }],
		["status", { status: 404 }],
		["detail", { detail: "Resource /api/users/123 does not exist" }],
		["report", { report: { timestamp: "2025-12-02T10:30:00Z" } }]
	])("should accept an object carrying %s alone", (_, value) => {
		expect(isProblem(value)).toBeTruthy();
	});

	it("should accept a member present with an undefined value", () => {
		expect(isProblem({ status: undefined })).toBeTruthy();
	});

	it("should accept extension members alongside a known member", () => {
		expect(isProblem({ status: 404, balance: 30, accounts: ["/account/12345"] })).toBeTruthy();
	});

	it.each([
		["an empty object", {}],
		["only extension members", { balance: 30 }]
	])("should reject an object carrying no known member: %s", (_, value) => {
		expect(isProblem(value)).toBeFalsy();
	});

	it.each([
		["type", { type: 0 }],
		["title", { title: 0 }],
		["instance", { instance: 0 }],
		["status", { status: "404" }],
		["detail", { detail: 0 }],
		["report", { report: () => undefined }]
	])("should reject an object carrying a malformed %s member", (_, value) => {
		expect(isProblem(value)).toBeFalsy();
	});

	it.each([
		["null", null],
		["undefined", undefined],
		["a string", "Not Found"],
		["a number", 404],
		["an array", [{ status: 404 }]],
		["an error", new Error("Network error")]
	])("should reject %s", (_, value) => {
		expect(isProblem(value)).toBeFalsy();
	});

});

describe("toProblem()", () => {

	it("should take a problem as it stands", () => {
		expect(toProblem({ status: 404, detail: "Not Found", balance: 30 }))
			.toEqual({ status: 404, detail: "Not Found", balance: 30 });
	});

	it("should convert an error to its name and message alone", () => {
		const error = new Error("Network error", { cause: new TypeError("Failed to fetch") });

		expect(toProblem(error)).toStrictEqual({
			status: 0,
			title: "Error",
			detail: "Network error"
		});
	});

	it.each([
		["an object", { balance: 30 }],
		["a scalar", "Network error"]
	])("should carry %s as report", (_, value) => {
		expect(toProblem(value)).toEqual({ status: 0, report: value });
	});

	it.each([
		["undefined", undefined, "undefined"],
		["a function", () => undefined, "() => undefined"]
	])("should render %s as detail", (_, value, detail) => {
		expect(toProblem(value)).toEqual({ status: 0, detail });
	});

	it("should return an immutable problem", () => {
		expect(Object.isFrozen(toProblem({ status: 404 }))).toBeTruthy();
	});

});

describe("success()", () => {

	describe("successful responses", () => {

		it("should resolve with response when response.ok is true", async () => {
			const mockResponse = {
				ok: true,
				status: 200,
				statusText: "OK"
			} as Response;

			const mockFetch = vi.fn<typeof fetch>().mockResolvedValue(mockResponse);
			const guard = success()(mockFetch);

			const result = await guard("https://api.example.com/data");

			expect(result).toBe(mockResponse);
			expect(mockFetch).toHaveBeenCalledWith("https://api.example.com/data", undefined);
		});

		it("should pass through init parameter to base fetch", async () => {
			const mockResponse = { ok: true, status: 200 } as Response;
			const mockFetch = vi.fn<typeof fetch>().mockResolvedValue(mockResponse);
			const guard = success()(mockFetch);

			const init: RequestInit = { method: "POST", headers: { "Content-Type": "application/json" } };
			await guard("https://api.example.com/data", init);

			expect(mockFetch).toHaveBeenCalledWith("https://api.example.com/data", init);
		});

	});

	describe("fetch exceptions", () => {

		it("should reject with Problem status 0 when fetch throws", async () => {
			const mockFetch = vi.fn<typeof fetch>().mockRejectedValue(new Error("Network error"));
			const guard = success()(mockFetch);

			await expect(guard("https://api.example.com/data"))
				.rejects
				.toMatchObject({
					status: 0,
					detail: "fetch error <Error: Network error>"
				});
		});

		it("should relay rejection values that are not Error instances", async () => {
			const problem: Problem = { status: 404, detail: "Not Found" };

			const mockFetch = vi.fn<typeof fetch>().mockRejectedValue(problem);
			const guard = success()(mockFetch);

			await expect(guard("https://api.example.com/data")).rejects.toBe(problem);
		});

		it("should leave problems raised by an inner layer untouched", async () => {
			const mockResponse = new Response("Resource not found", {
				status: 404,
				statusText: "Not Found",
				headers: { "Content-Type": "text/plain" }
			});

			const mockFetch = vi.fn<typeof fetch>().mockResolvedValue(mockResponse);
			const guard = success()(success()(mockFetch));

			await expect(guard("https://api.example.com/data"))
				.rejects
				.toMatchObject({
					status: 404,
					detail: "Not Found",
					report: "Resource not found"
				});
		});

		it("should handle TypeError from fetch (e.g., CORS)", async () => {
			const mockFetch = vi.fn<typeof fetch>().mockRejectedValue(new TypeError("Failed to fetch"));
			const guard = success()(mockFetch);

			await expect(guard("https://api.example.com/data"))
				.rejects
				.toMatchObject({
					status: 0,
					detail: "fetch error <TypeError: Failed to fetch>"
				});
		});

	});

	describe("non-ok responses with text/plain", () => {

		it("should reject with Problem containing text report", async () => {
			const mockResponse = {
				ok: false,
				status: 404,
				statusText: "Not Found",
				headers: {
					get: vi.fn().mockReturnValue("text/plain")
				},
				text: vi.fn().mockResolvedValue("Resource not found")
			} as unknown as Response;

			const mockFetch = vi.fn<typeof fetch>().mockResolvedValue(mockResponse);
			const guard = success()(mockFetch);

			await expect(guard("https://api.example.com/missing"))
				.rejects
				.toMatchObject({
					status: 404,
					detail: "Not Found",
					report: "Resource not found"
				});
		});

		it("should handle text/plain with charset", async () => {
			const mockResponse = {
				ok: false,
				status: 400,
				statusText: "Bad Request",
				headers: {
					get: vi.fn().mockReturnValue("text/plain; charset=utf-8")
				},
				text: vi.fn().mockResolvedValue("Invalid request parameters")
			} as unknown as Response;

			const mockFetch = vi.fn<typeof fetch>().mockResolvedValue(mockResponse);
			const guard = success()(mockFetch);

			await expect(guard("https://api.example.com/data"))
				.rejects
				.toMatchObject({
					status: 400,
					report: "Invalid request parameters"
				});
		});

		it("should reject without report if text parsing fails", async () => {
			const mockResponse = {
				ok: false,
				status: 500,
				statusText: "Internal Server Error",
				headers: {
					get: vi.fn().mockReturnValue("text/plain")
				},
				text: vi.fn().mockRejectedValue(new Error("Parse error"))
			} as unknown as Response;

			const mockFetch = vi.fn<typeof fetch>().mockResolvedValue(mockResponse);
			const guard = success()(mockFetch);

			await expect(guard("https://api.example.com/data"))
				.rejects
				.toMatchObject({
					status: 500,
					detail: "Internal Server Error"
				});

			const error: Problem = await guard("https://api.example.com/data").catch((e: unknown) => e as Problem);
			expect(error.report).toBeUndefined();
		});

	});

	describe("non-ok responses with JSON content types", () => {

		it("should reject with Problem containing JSON report for application/json", async () => {
			const reportData = { timestamp: "2025-12-07T10:00:00Z", errors: ["field1", "field2"] };
			const mockResponse = {
				ok: false,
				status: 422,
				statusText: "Unprocessable Entity",
				headers: {
					get: vi.fn().mockReturnValue("application/json")
				},
				json: vi.fn().mockResolvedValue(reportData)
			} as unknown as Response;

			const mockFetch = vi.fn<typeof fetch>().mockResolvedValue(mockResponse);
			const guard = success()(mockFetch);

			await expect(guard("https://api.example.com/data"))
				.rejects
				.toMatchObject({
					status: 422,
					detail: "Unprocessable Entity",
					report: reportData
				});
		});

		it("should handle application/problem+json", async () => {
			const reportData = { type: "validation-error", fields: ["email"] };
			const mockResponse = {
				ok: false,
				status: 400,
				statusText: "Bad Request",
				headers: {
					get: vi.fn().mockReturnValue("application/problem+json")
				},
				json: vi.fn().mockResolvedValue(reportData)
			} as unknown as Response;

			const mockFetch = vi.fn<typeof fetch>().mockResolvedValue(mockResponse);
			const guard = success()(mockFetch);

			await expect(guard("https://api.example.com/data"))
				.rejects
				.toMatchObject({
					status: 400,
					report: reportData
				});
		});

		it("should handle application/ld+json", async () => {
			const reportData = { "@context": "http://schema.org", "@type": "Error" };
			const mockResponse = {
				ok: false,
				status: 500,
				statusText: "Internal Server Error",
				headers: {
					get: vi.fn().mockReturnValue("application/ld+json")
				},
				json: vi.fn().mockResolvedValue(reportData)
			} as unknown as Response;

			const mockFetch = vi.fn<typeof fetch>().mockResolvedValue(mockResponse);
			const guard = success()(mockFetch);

			await expect(guard("https://api.example.com/data"))
				.rejects
				.toMatchObject({
					status: 500,
					report: reportData
				});
		});

		it("should handle JSON with charset", async () => {
			const reportData = { error: "unauthorized" };
			const mockResponse = {
				ok: false,
				status: 401,
				statusText: "Unauthorized",
				headers: {
					get: vi.fn().mockReturnValue("application/json; charset=utf-8")
				},
				json: vi.fn().mockResolvedValue(reportData)
			} as unknown as Response;

			const mockFetch = vi.fn<typeof fetch>().mockResolvedValue(mockResponse);
			const guard = success()(mockFetch);

			await expect(guard("https://api.example.com/data"))
				.rejects
				.toMatchObject({
					status: 401,
					report: reportData
				});
		});

		it("should reject without report if JSON parsing fails", async () => {
			const mockResponse = {
				ok: false,
				status: 500,
				statusText: "Internal Server Error",
				headers: {
					get: vi.fn().mockReturnValue("application/json")
				},
				json: vi.fn().mockRejectedValue(new Error("Invalid JSON"))
			} as unknown as Response;

			const mockFetch = vi.fn<typeof fetch>().mockResolvedValue(mockResponse);
			const guard = success()(mockFetch);

			await expect(guard("https://api.example.com/data"))
				.rejects
				.toMatchObject({
					status: 500,
					detail: "Internal Server Error"
				});

			const error: Problem = await guard("https://api.example.com/data").catch((e: unknown) => e as Problem);
			expect(error.report).toBeUndefined();
		});

		it("should report a JSON body that structurally resembles a Problem", async () => {
			const reportData = { status: 404, detail: "inner detail" };
			const mockResponse = {
				ok: false,
				status: 500,
				statusText: "Internal Server Error",
				headers: {
					get: vi.fn().mockReturnValue("application/json")
				},
				json: vi.fn().mockResolvedValue(reportData)
			} as unknown as Response;

			const mockFetch = vi.fn<typeof fetch>().mockResolvedValue(mockResponse);
			const guard = success()(mockFetch);

			await expect(guard("https://api.example.com/data"))
				.rejects
				.toMatchObject({
					status: 500,
					report: reportData
				});
		});

	});

	describe("non-ok responses with other content types", () => {

		it("should reject with Problem without report for text/html", async () => {
			const mockResponse = {
				ok: false,
				status: 404,
				statusText: "Not Found",
				headers: {
					get: vi.fn().mockReturnValue("text/html")
				}
			} as unknown as Response;

			const mockFetch = vi.fn<typeof fetch>().mockResolvedValue(mockResponse);
			const guard = success()(mockFetch);

			await expect(guard("https://api.example.com/data"))
				.rejects
				.toMatchObject({
					status: 404,
					detail: "Not Found"
				});

			const error: Problem = await guard("https://api.example.com/data").catch((e: unknown) => e as Problem);
			expect(error.report).toBeUndefined();
		});

		it("should reject with Problem without report for application/xml", async () => {
			const mockResponse = {
				ok: false,
				status: 503,
				statusText: "Service Unavailable",
				headers: {
					get: vi.fn().mockReturnValue("application/xml")
				}
			} as unknown as Response;

			const mockFetch = vi.fn<typeof fetch>().mockResolvedValue(mockResponse);
			const guard = success()(mockFetch);

			await expect(guard("https://api.example.com/data"))
				.rejects
				.toMatchObject({
					status: 503,
					detail: "Service Unavailable"
				});

			const error: Problem = await guard("https://api.example.com/data").catch((e: unknown) => e as Problem);
			expect(error.report).toBeUndefined();
		});

		it("should reject with Problem without report when Content-Type is null", async () => {
			const mockResponse = {
				ok: false,
				status: 500,
				statusText: "Internal Server Error",
				headers: {
					get: vi.fn().mockReturnValue(null)
				}
			} as unknown as Response;

			const mockFetch = vi.fn<typeof fetch>().mockResolvedValue(mockResponse);
			const guard = success()(mockFetch);

			await expect(guard("https://api.example.com/data"))
				.rejects
				.toMatchObject({
					status: 500,
					detail: "Internal Server Error"
				});

			const error: Problem = await guard("https://api.example.com/data").catch((e: unknown) => e as Problem);
			expect(error.report).toBeUndefined();
		});

	});

});
