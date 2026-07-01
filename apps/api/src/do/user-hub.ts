import { DurableObject } from "cloudflare:workers";
import type { Bindings } from "../env.js";

/**
 * 每用户一个实例（idFromName(userId)）：持有该用户浏览器端的 WebSocket 长连接，
 * 入站邮件时由 email() 处理器 POST /broadcast 推送 { type: "new-mail" }。
 *
 * 采用 Hibernation WebSocket API：空闲时 DO 可被换出内存、连接保持、不计费，
 * 来消息才唤醒（ctx.acceptWebSocket / getWebSockets）。
 */
export class UserHub extends DurableObject<Bindings> {
  async fetch(request: Request): Promise<Response> {
    // 1) 浏览器建立 WebSocket 长连
    if (request.headers.get("Upgrade") === "websocket") {
      const pair = new WebSocketPair();
      const client = pair[0];
      const server = pair[1];
      this.ctx.acceptWebSocket(server);
      return new Response(null, { status: 101, webSocket: client });
    }
    // 2) 服务端广播（由 email 处理器调用）
    const url = new URL(request.url);
    if (request.method === "POST" && url.pathname.endsWith("/broadcast")) {
      const body = await request.text();
      for (const ws of this.ctx.getWebSockets()) {
        try {
          ws.send(body);
        } catch {
          /* 已断开的连接忽略 */
        }
      }
      return new Response(null, { status: 204 });
    }
    return new Response("not found", { status: 404 });
  }

  // Hibernation 回调：客户端仅接收，这里无需处理其消息
  webSocketMessage(_ws: WebSocket, _message: string | ArrayBuffer): void {}
  webSocketClose(ws: WebSocket, code: number): void {
    try {
      ws.close(code >= 1000 && code < 5000 ? code : 1000);
    } catch {
      /* 忽略 */
    }
  }
  webSocketError(): void {}
}
