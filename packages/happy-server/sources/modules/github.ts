import { App } from "octokit";
import { Webhooks } from "@octokit/webhooks";
import type { EmitterWebhookEvent } from "@octokit/webhooks";
import { log } from "@/utils/log";
import { readFileSync, existsSync } from "fs";

let app: App | null = null;
let webhooks: Webhooks | null = null;

function resolvePrivateKey(): string | null {
    const value = process.env.GITHUB_PRIVATE_KEY;
    if (!value) return null;

    // If it looks like a file path, read the file
    if (existsSync(value)) {
        return readFileSync(value, 'utf-8');
    }

    // Otherwise treat as inline key content
    return value;
}

export async function initGithub() {
    const privateKey = resolvePrivateKey();
    if (
        process.env.GITHUB_APP_ID &&
        privateKey &&
        process.env.GITHUB_CLIENT_ID &&
        process.env.GITHUB_CLIENT_SECRET &&
        process.env.GITHUB_REDIRECT_URI &&
        process.env.GITHUB_WEBHOOK_SECRET
    ) {
        app = new App({
            appId: process.env.GITHUB_APP_ID,
            privateKey,
            webhooks: {
                secret: process.env.GITHUB_WEBHOOK_SECRET
            }
        });
        
        // Initialize standalone webhooks handler for type-safe event processing
        webhooks = new Webhooks({
            secret: process.env.GITHUB_WEBHOOK_SECRET
        });
        
        // Register type-safe event handlers
        registerWebhookHandlers();
    }
}

function registerWebhookHandlers() {
    if (!webhooks) return;
    
    // Type-safe handlers for specific events
    webhooks.on("push", async ({ id, name, payload }: EmitterWebhookEvent<"push">) => {
        log({ module: 'github-webhook', event: 'push' }, 
            `Push to ${payload.repository.full_name} by ${payload.pusher.name}`);
    });
    
    webhooks.on("pull_request", async ({ id, name, payload }: EmitterWebhookEvent<"pull_request">) => {
        log({ module: 'github-webhook', event: 'pull_request' }, 
            `PR ${payload.action} on ${payload.repository.full_name}: #${payload.pull_request.number} - ${payload.pull_request.title}`);
    });
    
    webhooks.on("issues", async ({ id, name, payload }: EmitterWebhookEvent<"issues">) => {
        log({ module: 'github-webhook', event: 'issues' }, 
            `Issue ${payload.action} on ${payload.repository.full_name}: #${payload.issue.number} - ${payload.issue.title}`);
    });
    
    webhooks.on(["star.created", "star.deleted"], async ({ id, name, payload }: EmitterWebhookEvent<"star.created" | "star.deleted">) => {
        const action = payload.action === 'created' ? 'starred' : 'unstarred';
        log({ module: 'github-webhook', event: 'star' }, 
            `Repository ${action}: ${payload.repository.full_name} by ${payload.sender.login}`);
    });
    
    webhooks.on("repository", async ({ id, name, payload }: EmitterWebhookEvent<"repository">) => {
        log({ module: 'github-webhook', event: 'repository' }, 
            `Repository ${payload.action}: ${payload.repository.full_name}`);
    });
    
    // Catch-all for unhandled events
    webhooks.onAny(async ({ id, name, payload }: EmitterWebhookEvent) => {
        log({ module: 'github-webhook', event: name as string }, 
            `Received webhook event: ${name}`, { id });
    });
    
    webhooks.onError((error: any) => {
        log({ module: 'github-webhook', level: 'error' }, 
            `Webhook handler error: ${error.event?.name}`, error);
    });
}

export function getWebhooks(): Webhooks | null {
    return webhooks;
}

export function getApp(): App | null {
    return app;
}