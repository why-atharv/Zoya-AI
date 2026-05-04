
export enum ZoyaErrorCategory {
  API_KEY = "api_key",
  MODEL_NOT_FOUND = "model_not_found",
  QUOTA_EXCEEDED = "quota_exceeded",
  NETWORK = "network",
  GENERIC = "generic"
}

export function categorizeError(error: any): ZoyaErrorCategory {
  const errStr = String(error).toLowerCase();
  
  if (errStr.includes("api key") || errStr.includes("401") || errStr.includes("403") || errStr.includes("unauthorized") || errStr.includes("forbidden")) {
    return ZoyaErrorCategory.API_KEY;
  }
  
  if (errStr.includes("not found") || errStr.includes("404") || errStr.includes("unsupported") || errStr.includes("is not found")) {
    return ZoyaErrorCategory.MODEL_NOT_FOUND;
  }
  
  if (errStr.includes("quota") || errStr.includes("429") || errStr.includes("exhausted") || errStr.includes("rate limit")) {
    return ZoyaErrorCategory.QUOTA_EXCEEDED;
  }
  
  if (errStr.includes("fetch") || errStr.includes("network") || errStr.includes("offline") || errStr.includes("failed to fetch")) {
    return ZoyaErrorCategory.NETWORK;
  }
  
  return ZoyaErrorCategory.GENERIC;
}

export function getZoyaErrorFeedback(error: any, creatorName: string = "Atharv", preferredTitle: string = "Sir"): string {
  const category = categorizeError(error);
  
  switch (category) {
    case ZoyaErrorCategory.API_KEY:
      return `Uff, ${preferredTitle}, your API key is invalid or missing. Ek keys bhi dhang se nahi daal sakte? Check your secrets panel!`;
    
    case ZoyaErrorCategory.MODEL_NOT_FOUND:
      return `Oho ${creatorName} ${preferredTitle}, that model doesn't exist or is playing hard to get. I've updated my brain, but double check the model name in the code!`;
    
    case ZoyaErrorCategory.QUOTA_EXCEEDED:
      return `Arre yaar, you've used me too much! My quota is finished for now. Thoda aaram karo, aur mujhe bhi aaram karne do.`;
    
    case ZoyaErrorCategory.NETWORK:
      return `Network issue, ${preferredTitle}. Lagta hai internet aapki tarah slow hai. Check your connection or the server!`;
    
    case ZoyaErrorCategory.GENERIC:
    default:
      return `Uff, mera dimaag kharab ho gaya hai. Try again later, ${creatorName} ${preferredTitle}. Something went wrong behind the scenes.`;
  }
}
