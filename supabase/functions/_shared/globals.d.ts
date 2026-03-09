declare namespace EdgeRuntime {
    export function waitUntil<T>(promise: Promise<T>): Promise<T>;
}
