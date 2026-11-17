export const speechScope = "https://cognitiveservices.azure.com/.default";

function isValidSpeechEndpoint(endpoint) {
  try {
    const url = new URL(endpoint);
    return (
      url.protocol === "https:" &&
      url.hostname.endsWith(".cognitiveservices.azure.com") &&
      url.hostname !== "cognitiveservices.azure.com" &&
      !url.port &&
      url.pathname === "/" &&
      !url.search &&
      !url.hash &&
      !url.username &&
      !url.password
    );
  } catch {
    return false;
  }
}

export function createSpeechService({
  endpoint,
  enabled,
  allowAccess,
  credential,
}) {
  const configuredEndpoint = endpoint?.trim();
  const validEndpoint = isValidSpeechEndpoint(configuredEndpoint);
  if (enabled && allowAccess && !validEndpoint) {
    throw new Error(
      "AZURE_SPEECH_ENDPOINT must be an HTTPS custom Speech resource endpoint.",
    );
  }

  const available = Boolean(enabled && allowAccess && validEndpoint);

  return {
    getConfig() {
      return available
        ? { enabled: true, endpoint: configuredEndpoint }
        : { enabled: false };
    },

    async getAccessToken() {
      if (!available) {
        return null;
      }

      const accessToken = await credential.getToken(speechScope);
      if (
        !accessToken?.token ||
        !Number.isFinite(accessToken.expiresOnTimestamp)
      ) {
        throw new Error("Microsoft Entra did not return a valid Speech token.");
      }
      return accessToken;
    },
  };
}
