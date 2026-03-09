import { createRequire } from "node:module";
import http from "node:http";
import https from "node:https";
import type { AddressInfo } from "node:net";

const require = createRequire(import.meta.url);
// Get the same https instance that CJS modules (e.g. duo_api) use
const cjsHttps = require("https");

/**
 * Starts a local HTTP server with the given handler and patches the CJS
 * `https.request` so that any request to `interceptHost` is transparently
 * forwarded to the local server over plain HTTP.
 */
export async function createHttpsInterceptor(
    interceptHost: string,
    handler: http.RequestListener,
): Promise<AsyncDisposable> {
    const server = http.createServer(handler);
    await new Promise<void>((resolve) => server.listen(0, resolve));
    const port = (server.address() as AddressInfo).port;

    const originalRequest = https.request as (
        options: https.RequestOptions | string | URL,
        callback?: (res: http.IncomingMessage) => void,
    ) => http.ClientRequest;

    cjsHttps.request = function (
        options: https.RequestOptions | string | URL,
        callback?: (res: http.IncomingMessage) => void,
    ): http.ClientRequest {
        const host = typeof options === "object" && !(options instanceof URL)
            ? options.host
            : undefined;
        if (host === interceptHost) {
            return http.request(
                { ...(options as http.RequestOptions), host: "127.0.0.1", port, protocol: "http:" },
                callback,
            );
        }
        return originalRequest.call(https, options, callback);
    };

    return {
        async [Symbol.asyncDispose]() {
            cjsHttps.request = originalRequest;
            await new Promise<void>((resolve, reject) =>
                server.close((err) => (err ? reject(err) : resolve()))
            );
        },
    };
}
