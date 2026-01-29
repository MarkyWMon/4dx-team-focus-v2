import React from 'react';
import { TicketStat } from '../types';

interface TicketDetailModalProps {
  stat: TicketStat;
  onClose: () => void;
}

const TicketDetailModal: React.FC<TicketDetailModalProps> = ({ stat, onClose }) => {
  return (
    <div className="fixed inset-0 z-50 overflow-y-auto" aria-labelledby="modal-title" role="dialog" aria-modal="true">
      <div className="flex items-end justify-center min-h-screen pt-4 px-4 pb-20 text-center sm:block sm:p-0">
        
        {/* Backdrop */}
        <div 
          className="fixed inset-0 bg-brand-navy bg-opacity-75 transition-opacity backdrop-blur-sm" 
          aria-hidden="true" 
          onClick={onClose}
        ></div>

        <span className="hidden sm:inline-block sm:align-middle sm:h-screen" aria-hidden="true">&#8203;</span>

        <div className="inline-block align-bottom bg-white rounded-xl text-left overflow-hidden shadow-xl transform transition-all sm:my-8 sm:align-middle sm:max-w-2xl sm:w-full">
          
          {/* Header */}
          <div className="bg-brand-navy px-6 py-4 flex justify-between items-center">
             <div>
                <h3 className="text-xl leading-6 font-bold text-white font-display" id="modal-title">
                  {stat.label}
                </h3>
                <p className="text-blue-200 text-sm mt-1">{stat.count} Tickets in this category</p>
             </div>
             <button onClick={onClose} className="text-white hover:text-brand-red transition-colors">
               <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12"></path></svg>
             </button>
          </div>

          <div className="px-6 py-6">
            
            {/* AI Insight Section */}
            <div className="mb-8 bg-orange-50 border-l-4 border-brand-orange p-4 rounded-r-lg">
              <div className="flex items-start">
                 <div className="flex-shrink-0">
                    {/* Sparkle Icon */}
                    <svg className="h-6 w-6 text-brand-orange" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 10V3L4 14h7v7l9-11h-7z" />
                    </svg>
                 </div>
                 <div className="ml-3">
                   <h4 className="text-sm font-bold text-brand-orange uppercase tracking-wide font-display">
                     AI Strategic Insight
                   </h4>
                   <p className="mt-2 text-sm text-gray-800 leading-relaxed">
                     {stat.themeSummary || "No detailed analysis available for this category."}
                   </p>
                 </div>
              </div>
            </div>

            {/* Ticket Examples List */}
            <div>
              <h4 className="text-sm font-bold text-gray-500 uppercase tracking-wide font-display mb-4">
                Recent Examples
              </h4>
              <div className="bg-gray-50 rounded-lg border border-gray-200 divide-y divide-gray-200 max-h-60 overflow-y-auto">
                {stat.examples.length > 0 ? (
                  stat.examples.map((ex, idx) => (
                    <div key={idx} className="p-3 hover:bg-white transition-colors">
                      <p className="text-sm text-gray-800 font-medium">{ex.summary}</p>
                      {ex.date && <p className="text-xs text-gray-400 mt-1">{ex.date}</p>}
                    </div>
                  ))
                ) : (
                  <div className="p-4 text-center text-gray-400 text-sm italic">
                    No examples extracted.
                  </div>
                )}
              </div>
            </div>
          </div>

          <div className="bg-gray-50 px-4 py-3 sm:px-6 sm:flex sm:flex-row-reverse border-t border-gray-100">
            <button
              type="button"
              className="w-full inline-flex justify-center rounded-md border border-transparent shadow-sm px-4 py-2 bg-brand-navy text-base font-medium text-white hover:bg-opacity-90 focus:outline-none sm:ml-3 sm:w-auto sm:text-sm font-display uppercase tracking-wide"
              onClick={onClose}
            >
              Close
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default TicketDetailModal;