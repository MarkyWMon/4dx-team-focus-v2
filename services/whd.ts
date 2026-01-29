
import { Ticket } from '../types';
import { getWeekId, parseDate } from '../utils';
import { StorageService } from './storage';

/**
 * SolarWinds WHD API Integration Service
 * Optimized for Cloud Deployments (CORS & HTTPS checks)
 */
export const WHDService = {
  mapWHDTickets: (rawTickets: any): Ticket[] => {
    let ticketsArray: any[] = [];
    if (Array.isArray(rawTickets)) {
      ticketsArray = rawTickets;
    } else if (rawTickets && typeof rawTickets === 'object') {
      if (rawTickets.id || rawTickets.ticket_id) {
        ticketsArray = [rawTickets];
      } else {
        ticketsArray = rawTickets.tickets || rawTickets.data || [];
      }
    }
    
    return ticketsArray.map(t => {
      const rawDate = t.opened_at || t.date || t.createdAt;
      const dateObj = parseDate(rawDate) || new Date();
      
      return {
        id: String(t.id || t.ticket_id || Math.random()),
        summary: (t.details || t.summary || t.subject || "No details provided").trim(),
        assignee: t.tech || t.assignee || t.technician || "Unassigned",
        category: t.category || t.request_type || "General Support",
        requestor: t.requestor || t.client || "Unknown User",
        createdAt: dateObj.getTime(),
        weekId: getWeekId(dateObj),
        status: t.status || "Closed",
        priority: t.priority || "Medium"
      };
    });
  },

  processManualJson: (rawJson: string): Ticket[] => {
    try {
      const data = JSON.parse(rawJson);
      return WHDService.mapWHDTickets(data);
    } catch (e) {
      throw new Error("Invalid JSON format. Please ensure you copied the entire response from the helpdesk.");
    }
  },

  fetchAndSync: async (): Promise<Ticket[]> => {
    const endpoint = StorageService.getProxyUrl();
    
    if (!endpoint) {
      throw new Error("Helpdesk Proxy URL is not configured.");
    }

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 25000); 

    try {
      const response = await fetch(endpoint, {
        method: 'GET',
        mode: 'cors',
        headers: { 'Accept': 'application/json' },
        signal: controller.signal
      });

      clearTimeout(timeoutId);

      const contentType = response.headers.get('content-type') || '';
      
      if (contentType.includes('application/json')) {
        const data = await response.json();
        
        if (!response.ok) {
          if (data.error) {
            let msg = `Helpdesk Issue: ${data.error}`;
            if (data.details) msg += `\n\nSolution: ${data.details}`;
            throw new Error(msg);
          }
          throw new Error(`Helpdesk server returned status ${response.status}.`);
        }

        return WHDService.mapWHDTickets(data);
      }

      if (!response.ok) {
        throw new Error(`Proxy unreachable (Status ${response.status}). Check if Cloud Run container crashed.`);
      }

      throw new Error("Received an unexpected non-JSON response from the proxy.");
    } catch (e: any) {
      clearTimeout(timeoutId);
      
      if (e.name === 'TypeError' && e.message === 'Failed to fetch') {
         const isDirectWHD = endpoint.toLowerCase().includes('bhasvic.ac.uk') || endpoint.toLowerCase().includes('helpdesk');
         
         if (isDirectWHD) {
            throw new Error(
              "SECURITY BLOCK: You are hitting herbert directly. The browser blocks this for security. " +
              "Change your Proxy URL to your Google Cloud Run address."
            );
         }
         
         throw new Error(
           "Network Blocked (CORS/SSL): The browser refused the connection. " +
           "Ensure your proxy is running and that you are using the correct Cloud Run URL."
         );
      }

      if (e.name === 'AbortError') throw new Error("Connection timed out (25s). The helpdesk server is taking too long to respond.");
      throw e;
    }
  }
};
