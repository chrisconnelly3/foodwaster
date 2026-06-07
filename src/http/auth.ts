import type { FastifyRequest, FastifyReply } from "fastify";

export function checkPasscode(expected: string, provided: string | undefined): boolean {
  return !!provided && provided === expected;
}

export function passcodeGuard(expected: string) {
  return async (req: FastifyRequest, reply: FastifyReply) => {
    const provided = (req.headers["x-passcode"] as string | undefined) ?? undefined;
    if (!checkPasscode(expected, provided)) {
      reply.code(401).send({ error: "unauthorized" });
    }
  };
}
