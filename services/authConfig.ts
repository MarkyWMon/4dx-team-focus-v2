
/**
 * PRODUCTION CONFIGURATION
 * 
 * Authentication Strategy: Microsoft Identity Platform (MSAL.js)
 * Flow: Auth Code Flow with PKCE (Standard for SPA)
 * 
 * SECURITY: All credentials loaded from environment variables.
 * Set these in your .env.local file:
 *   - VITE_AZURE_CLIENT_ID
 *   - VITE_AZURE_TENANT_ID
 */

// Load credentials from environment - fail gracefully if not set
const azureClientId = import.meta.env.VITE_AZURE_CLIENT_ID || '';
const azureTenantId = import.meta.env.VITE_AZURE_TENANT_ID || '';

// Warn in development if credentials are missing
if (!azureClientId || !azureTenantId) {
  console.warn('⚠️ Azure AD credentials not configured in environment variables.');
  console.warn('   Set VITE_AZURE_CLIENT_ID and VITE_AZURE_TENANT_ID in .env.local');
}

export const msalConfig = {
  auth: {
    // Application (client) ID from Azure Portal
    clientId: azureClientId,

    // Directory (tenant) ID from Azure Portal
    authority: azureTenantId ? `https://login.microsoftonline.com/${azureTenantId}` : '',

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
