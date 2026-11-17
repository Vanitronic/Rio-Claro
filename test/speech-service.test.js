import assert from "node:assert/strict";
import { test } from "node:test";
import {
  createSpeechService,
  speechScope,
} from "../scripts/speechService.js";

test("Azure Speech solo está disponible cuando está habilitado localmente", async () => {
  const token = {
    token: "entra-access-token",
    expiresOnTimestamp: Date.now() + 3_600_000,
  };
  const requestedScopes = [];
  const service = createSpeechService({
    enabled: true,
    allowAccess: true,
    endpoint: "https://rio-claro.cognitiveservices.azure.com/",
    credential: {
      async getToken(scope) {
        requestedScopes.push(scope);
        return token;
      },
    },
  });

  assert.deepEqual(service.getConfig(), {
    enabled: true,
    endpoint: "https://rio-claro.cognitiveservices.azure.com/",
  });
  assert.equal(await service.getAccessToken(), token);
  assert.deepEqual(requestedScopes, [speechScope]);
});

test("Azure Speech no emite tokens si el acceso está deshabilitado", async () => {
  const service = createSpeechService({
    enabled: true,
    allowAccess: false,
    credential: {
      async getToken() {
        assert.fail("No debe solicitar credenciales con el acceso bloqueado.");
      },
    },
  });

  assert.deepEqual(service.getConfig(), { enabled: false });
  assert.equal(await service.getAccessToken(), null);
});

test("rechaza endpoints que podrían exponer credenciales a dominios externos", () => {
  assert.throws(
    () =>
      createSpeechService({
        enabled: true,
        allowAccess: true,
        endpoint: "https://attacker.example/",
        credential: {},
      }),
    /AZURE_SPEECH_ENDPOINT/,
  );
});
