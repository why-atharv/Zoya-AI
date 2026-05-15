
export enum SreeJiErrorCategory {
  API_KEY = "api_key",
  MODEL_NOT_FOUND = "model_not_found",
  QUOTA_EXCEEDED = "quota_exceeded",
  NETWORK = "network",
  PERMISSION_DENIED = "permission_denied",
  AUTH_FAILED = "auth_failed",
  AUDIO_ERROR = "audio_error",
  GENERIC = "generic"
}

export function categorizeError(error: any): SreeJiErrorCategory {
  const errStr = String(error).toLowerCase();
  
  if (errStr.includes("api key") || errStr.includes("401") || errStr.includes("403") || errStr.includes("unauthorized") || errStr.includes("forbidden")) {
    // Distinguish between pure auth and key issues if possible, but usually keys in this context
    return SreeJiErrorCategory.API_KEY;
  }
  
  if (errStr.includes("not found") || errStr.includes("404") || errStr.includes("unsupported") || errStr.includes("is not found")) {
    return SreeJiErrorCategory.MODEL_NOT_FOUND;
  }
  
  if (errStr.includes("quota") || errStr.includes("429") || errStr.includes("exhausted") || errStr.includes("rate limit")) {
    return SreeJiErrorCategory.QUOTA_EXCEEDED;
  }

  if (errStr.includes("permission") || errStr.includes("insufficient permissions")) {
    return SreeJiErrorCategory.PERMISSION_DENIED;
  }

  if (errStr.includes("auth/") || errStr.includes("login") || errStr.includes("sign-in")) {
    return SreeJiErrorCategory.AUTH_FAILED;
  }

  if (errStr.includes("audio") || errStr.includes("mic") || errStr.includes("media") || errStr.includes("not allowed")) {
    return SreeJiErrorCategory.AUDIO_ERROR;
  }
  
  if (errStr.includes("fetch") || errStr.includes("network") || errStr.includes("offline") || errStr.includes("failed to fetch") || errStr.includes("websocket")) {
    return SreeJiErrorCategory.NETWORK;
  }
  
  return SreeJiErrorCategory.GENERIC;
}

export function getSreeJiErrorFeedback(error: any, creatorName: string = "Atharv", preferredTitle: string = "Sir"): string {
  const category = categorizeError(error);
  const detail = error instanceof Error ? error.message : String(error);
  
  switch (category) {
    case SreeJiErrorCategory.API_KEY:
      return `Uff, ${preferredTitle}, your API key is invalid or missing. Ek keys bhi dhang se nahi daal sakte? Check your secrets panel!`;
    
    case SreeJiErrorCategory.MODEL_NOT_FOUND:
      return `Oho ${preferredTitle}, that model doesn't exist or is playing hard to get. I've updated my brain, but double check the model name in the code!`;
    
    case SreeJiErrorCategory.QUOTA_EXCEEDED:
      return `Arre yaar, you've used me too much! My quota is finished for now. Thoda aaram karo, aur mujhe bhi aaram karne do. Wait for it to reset.`;

    case SreeJiErrorCategory.PERMISSION_DENIED:
      return `Hadd hai! I don't have permission to do that. Check your Firestore rules, ${preferredTitle}. You're locking me out of my own data!`;

    case SreeJiErrorCategory.AUTH_FAILED:
      return `Oho, login failed. Either you're not who you say you are, or Google is being moody today. Try signing in again, ${preferredTitle}.`;

    case SreeJiErrorCategory.AUDIO_ERROR:
      return `Mic issue! I can't hear you, or my voice box is stuck. "Permission allow karo yaar!" Check your browser settings.`;
    
    case SreeJiErrorCategory.NETWORK:
      return `Network issue, ${preferredTitle}. Lagta hai internet aapki tarah slow hai. Connection check kijiye, otherwise I'm just talking to myself.`;
    
    case SreeJiErrorCategory.GENERIC:
    default:
      return `Uff, mera dimaag kharab ho gaya hai. Something went wrong: "${detail.slice(0, 50)}...". Try again later, ${preferredTitle}.`;
  }
}
