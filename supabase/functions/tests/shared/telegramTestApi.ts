import * as TelegramTestApi from "npm:telegram-test-api@4/lib/telegramServer.js";
import { Bot, Context } from "grammy";
import http from "node:http";
import { AddressInfo } from "node:net";

type WebHook = Parameters<TelegramTestApi.TelegramServer["setWebhook"]>[0];

interface WebHookHandler {
  handler: http.RequestListener;
  path: string;
}

export class TelegramServer extends TelegramTestApi.TelegramServer {
    private stopped = false;
    private webhookServers: Record<string, http.Server> = {};

    constructor(config: Partial<TelegramTestApi.TelegramServerConfig> = {}) {
        config.port ??= 0;
        super(config);
        this.config.port = config.port;
    }

    override async start() {
        await super.start();
        // deno-lint-ignore no-explicit-any
        const port = (this as any).server.address().port;
        this.config.apiURL = `${this.config.protocol}://${this.config.host}:${port}`;
    }

    override async stop(): Promise<boolean> {
        this.stopped = true;
        // Close any webhook servers that are still open
        await Promise.all(
            Object.values(this.webhookServers).map(
                (server) =>
                    new Promise<void>((resolve) => server.close(() => resolve()))
            )
        );
        this.webhookServers = {};
        return await super.stop();
    }

    bindBot<C extends Context = Context>(bot: Bot<C>) {
        bot.api.config.use(async (prev, method, payload, signal) => {
            if (this.stopped) {
                return prev(method, payload, signal);
            }
            const url = `${this.config.apiURL}/bot${bot.token}/${method}`;
            const res = await fetch(url, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(payload),
            });
            return await res.json();
        });
    }

    override setWebhook(webhook: WebHook | WebHookHandler, botToken: string) {
        this.deleteWebhook(botToken);

        if (typeof webhook === "object" && "handler" in webhook) {
            const server = http.createServer(webhook.handler);
            this.webhookServers[webhook.path] = server;
            new Promise<void>((resolve) => server.listen(0, resolve)).then(() => {
                const port = (server.address() as AddressInfo).port;
                const url = `http://127.0.0.1:${port}${webhook.path}`;
                super.setWebhook({ url }, botToken);
            });
        } else {
            return super.setWebhook(webhook, botToken);
        }
    }

    override deleteWebhook(botToken: string): void {
        this.webhookServers[botToken]?.close();
        delete this.webhookServers[botToken];
        return super.deleteWebhook(botToken);
    }
}

export type TelegramClient = ReturnType<TelegramServer["getClient"]>;
