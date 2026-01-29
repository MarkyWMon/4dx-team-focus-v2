
/**
 * PRODUCTION CONFIGURATION
 * 
 * Authentication Strategy: Microsoft Identity Platform (MSAL.js)
 * Flow: Auth Code Flow with PKCE (Standard for SPA)
 */

export const msalConfig = {
  auth: {
    // Application (client) ID from your Azure Screenshot
    clientId: "298ab135-204f-4376-b22f-f6e8b940e65d", 
    
    // Directory (tenant) ID from your Azure Screenshot
    authority: `https://login.microsoftonline.com/1e86a4bd-7841-4cbe-8f6f-ea7a050fc502`,
    
    // Redirect URI - Must be registered in Azure 'SPA' platform
    redirectUri: window.location.origin, 
    
    // Recommended for SPAs to prevent redirect loops
    navigateToLoginRequestUrl: false,
  },
  cache: {
    cacheLocation: "localStorage", 
    storeAuthStateInCookie: false,
  },
};

// Standard OIDC Scopes
export const loginRequest = {
  scopes: ["User.Read", "openid", "profile", "email"]
};
