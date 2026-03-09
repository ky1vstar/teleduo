import duo_api from "npm:@duosecurity/duo_api@1";

type JsonApiCallArgs = Parameters<typeof duo_api.Client.prototype.jsonApiCall>;

export interface DuoClient {
    jsonApiCall: InstanceType<typeof duo_api.Client>["jsonApiCall"];
    jsonApiCallAsync(
        method: JsonApiCallArgs[0],
        path: JsonApiCallArgs[1],
        params: JsonApiCallArgs[2],
    // deno-lint-ignore no-explicit-any
    ): Promise<any>;
}

export function createDuoClient(
    ikey: string,
    skey: string,
    host: string,
    signatureVersion = SIGNATURE_VERSION_5,
): DuoClient {
    const client = new duo_api.Client(ikey, skey, host, signatureVersion);
    return {
        jsonApiCall: client.jsonApiCall.bind(client),
        jsonApiCallAsync(method, path, params) {
            return new Promise((resolve) =>
                client.jsonApiCall(method, path, params, resolve)
            );
        },
    };
}

export const SIGNATURE_VERSION_2 = duo_api.SIGNATURE_VERSION_2;
export const SIGNATURE_VERSION_5 = duo_api.SIGNATURE_VERSION_5;
