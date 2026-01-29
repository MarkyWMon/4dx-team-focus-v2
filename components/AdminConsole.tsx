
import React, { useState, useEffect } from 'react';
import { TeamMember, LoginLog, ChangeRequest, Commitment, Ticket } from '../types';
import { StorageService } from '../services/storage';
import { formatDateShort } from '../utils';

interface AdminConsoleProps {
  currentUser: TeamMember;
  members: TeamMember[];
  onRefreshData: () => void;
}

const AdminConsole: React.FC<AdminConsoleProps> = ({ currentUser, members, onRefreshData }) => {
  const [activeTab, setActiveTab] = useState<'users' | 'analytics' | 'approvals'>('users');
  const [logs, setLogs] = useState<LoginLog[]>([]);
  const [requests, setRequests] = useState<ChangeRequest[]>([]);

  // Analytics State
  const [totalCommits, setTotalCommits] = useState(0);
  const [totalTickets, setTotalTickets] = useState(0);
  const [avgCompletion, setAvgCompletion] = useState(0);

  useEffect(() => {
    loadAdminData();
  }, []);

  const loadAdminData = () => {
    setLogs(StorageService.getLoginLogs());
    setRequests(StorageService.getChangeRequests());

    // Calc Analytics
    const commits = StorageService.getCommitments();
    const tickets = StorageService.getTickets();
    setTotalCommits(commits.length);
    setTotalTickets(tickets.length);

    if (commits.length > 0) {
      const completed = commits.filter(c => c.status === 'completed').length;
      const partial = commits.filter(c => c.status === 'partial').length;
      const score = completed + (partial * 0.5);
      setAvgCompletion(Math.round((score / commits.length) * 100));
    }
  };

  const handleApproval = async (id: string, action: 'approve' | 'reject') => {
    await StorageService.resolveChangeRequest(id, action);
    loadAdminData();
    onRefreshData();
    alert(`Strategy update ${action}d.`);
  };

  const handleDeleteUser = async (id: string, name: string) => {
    if (window.confirm(`Permanently remove ${name} from BHASVIC 4DX Production?`)) {
      await StorageService.removeMember(id);
      onRefreshData();
    }
  };

  return (
    <div className="space-y-6">
      <div className="bg-white p-6 rounded-xl shadow-sm border-t-4 border-slate-900">
        <h2 className="text-xl font-bold text-slate-900 font-display mb-4 uppercase tracking-tight">Production Admin Console</h2>
        <div className="flex space-x-6 border-b border-slate-100 pb-1">
          <button onClick={() => setActiveTab('users')} className={`pb-3 px-1 text-[10px] font-black uppercase tracking-widest transition-all ${activeTab === 'users' ? 'border-b-4 border-brand-red text-slate-900' : 'text-slate-400 hover:text-slate-600'}`}>Members & Access</button>
          <button onClick={() => setActiveTab('approvals')} className={`pb-3 px-1 text-[10px] font-black uppercase tracking-widest transition-all ${activeTab === 'approvals' ? 'border-b-4 border-brand-red text-slate-900' : 'text-slate-400 hover:text-slate-600'}`}>Approvals {requests.length > 0 && <span className="ml-2 bg-brand-red text-white px-2 py-0.5 rounded-full text-[8px]">{requests.length}</span>}</button>
          <button onClick={() => setActiveTab('analytics')} className={`pb-3 px-1 text-[10px] font-black uppercase tracking-widest transition-all ${activeTab === 'analytics' ? 'border-b-4 border-brand-red text-slate-900' : 'text-slate-400 hover:text-slate-600'}`}>Team Analytics</button>
        </div>

        <div className="mt-8">
          {activeTab === 'users' && (
            <div className="animate-fade-in">
              <h3 className="text-xs font-semibold text-slate-600 uppercase tracking-widest mb-6">Active Roster</h3>
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-slate-100">
                  <thead className="bg-slate-50">
                    <tr>
                      <th className="px-6 py-4 text-left text-[9px] font-black text-slate-400 uppercase tracking-[0.2em]">Member</th>
                      <th className="px-6 py-4 text-left text-[9px] font-black text-slate-400 uppercase tracking-[0.2em]">Security Tier</th>
                      <th className="px-6 py-4 text-left text-[9px] font-black text-slate-400 uppercase tracking-[0.2em]">Production Last Seen</th>
                      <th className="px-6 py-4 text-right text-[9px] font-black text-slate-400 uppercase tracking-[0.2em]">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-slate-100">
                    {members.map(member => (
                      <tr key={member.id} className="hover:bg-slate-50 transition-colors">
                        <td className="px-6 py-4 whitespace-nowrap">
                          <div className="flex items-center">
                            <div className="h-9 w-9 rounded-xl bg-slate-900 flex items-center justify-center text-white text-xs font-semibold mr-4 shadow-sm">{member.avatar}</div>
                            <div>
                              <div className="text-sm font-semibold text-slate-900">{member.name}</div>
                              <div className="text-[10px] font-bold text-slate-400">{member.email}</div>
                            </div>
                          </div>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <span className={`px-3 py-1 text-[8px] font-black uppercase tracking-widest rounded-full ${member.role === 'ADMIN' ? 'bg-slate-900 text-white' : member.role === 'MANAGER' ? 'bg-blue-100 text-blue-700' : 'bg-green-100 text-green-700'}`}>
                            {member.role}
                          </span>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-[10px] font-bold text-slate-500 uppercase">
                          {member.lastLogin ? new Date(member.lastLogin).toLocaleString('en-GB') : 'Sync Required'}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-right text-xs font-semibold">
                          {member.id !== currentUser.id && (
                            <button onClick={() => handleDeleteUser(member.id, member.name)} className="text-brand-red hover:text-black transition-colors uppercase tracking-widest text-[9px] font-black">Revoke Access</button>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-widest mt-12 mb-4">Production Audit Log</h4>
              <div className="bg-slate-900 p-6 rounded-2xl h-56 overflow-y-auto text-[10px] font-mono text-slate-400 border border-slate-800 shadow-inner">
                {logs.map(log => (
                  <div key={log.id} className="mb-2 border-b border-slate-800 pb-2 last:border-0 opacity-80 hover:opacity-100">
                    <span className="text-slate-600">[{new Date(log.timestamp).toLocaleString()}]</span> <span className="font-black text-slate-100 uppercase tracking-tighter">{log.userName}</span> accessed production.
                  </div>
                ))}
              </div>
            </div>
          )}

          {activeTab === 'approvals' && (
            <div className="animate-fade-in">
              <h3 className="text-xs font-semibold text-slate-600 uppercase tracking-widest mb-6">Pending Strategic Adjustments</h3>
              {requests.length === 0 ? (
                <div className="bg-slate-50 rounded-2xl p-12 text-center border-2 border-dashed border-slate-200">
                  <p className="text-[10px] font-black text-slate-300 uppercase tracking-[0.2em]">All strategy updates resolved</p>
                </div>
              ) : (
                <div className="space-y-4">
                  {requests.map(req => (
                    <div key={req.id} className="bg-white border-2 border-slate-100 p-6 rounded-2xl flex justify-between items-center shadow-sm hover:border-brand-red transition-all">
                      <div>
                        <div className="text-xs font-semibold text-slate-900 uppercase tracking-tight mb-1">{req.measureName}</div>
                        <div className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Requested by {req.requestedBy}</div>
                        <div className="mt-4 flex items-center gap-3">
                          <span className="bg-red-50 text-brand-red px-2 py-1 rounded font-black text-[10px] line-through">{req.previousValue}</span>
                          <svg className="w-3 h-3 text-slate-300" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M14 5l7 7-7 7M5 12h16" /></svg>
                          <span className="bg-green-50 text-brand-green px-2 py-1 rounded font-black text-[10px]">{req.newValue}</span>
                        </div>
                      </div>
                      <div className="flex gap-2">
                        <button onClick={() => handleApproval(req.id, 'approve')} className="bg-slate-900 text-white px-6 py-3 rounded-xl text-[9px] font-black uppercase tracking-widest hover:bg-brand-green transition-all shadow-lg">Approve</button>
                        <button onClick={() => handleApproval(req.id, 'reject')} className="bg-white text-slate-400 px-6 py-3 rounded-xl text-[9px] font-black uppercase tracking-widest hover:text-brand-red border border-slate-100 transition-all">Reject</button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {activeTab === 'analytics' && (
            <div className="animate-fade-in">
              <h3 className="text-xs font-semibold text-slate-600 uppercase tracking-widest mb-6">Team Execution Pulse</h3>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <div className="bg-white p-6 rounded-2xl border-2 border-slate-100 shadow-sm">
                  <div className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-1">Production Roster</div>
                  <div className="text-2xl font-bold text-slate-900">{members.length} Users</div>
                </div>
                <div className="bg-white p-6 rounded-2xl border-2 border-slate-100 shadow-sm">
                  <div className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-1">Global Commitments</div>
                  <div className="text-2xl font-bold text-slate-900">{totalCommits} Actions</div>
                </div>
                <div className="bg-white p-6 rounded-2xl border-2 border-slate-100 shadow-sm">
                  <div className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-1">Execution Velocity</div>
                  <div className="text-2xl font-bold text-brand-green">{avgCompletion}%</div>
                </div>
              </div>

              <div className="mt-12 bg-slate-50 p-8 rounded-3xl border-2 border-slate-100 shadow-inner">
                <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] mb-4">Infrastructure Health</h4>
                <div className="grid grid-cols-2 gap-8">
                  <div>
                    <p className="text-[8px] font-black text-slate-400 uppercase tracking-widest mb-1">Storage Engine</p>
                    <p className="text-xs font-bold text-slate-900 uppercase">Google Firestore Production</p>
                  </div>
                  <div>
                    <p className="text-[8px] font-black text-slate-400 uppercase tracking-widest mb-1">Security Status</p>
                    <div className="flex items-center gap-2">
                      <div className="w-2 h-2 rounded-full bg-brand-green animate-pulse"></div>
                      <p className="text-xs font-bold text-brand-green uppercase">Database Locked (RBAC Active)</p>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default AdminConsole;
