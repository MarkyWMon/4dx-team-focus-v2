
import React, { useState, useEffect, useRef } from 'react';
import { TeamMember } from '../types';
import { StorageService } from '../services/storage';

interface ProfileDropdownProps {
    currentUser: TeamMember;
    onLogout: () => void;
}

const ProfileDropdown: React.FC<ProfileDropdownProps> = ({ currentUser, onLogout }) => {
    const [isOpen, setIsOpen] = useState(false);
    const [isEditing, setIsEditing] = useState(false);
    const [profileName, setProfileName] = useState(currentUser.name || '');
    const [profileAvatar, setProfileAvatar] = useState(currentUser.avatar || '');
    const [profileJobTitle, setProfileJobTitle] = useState(currentUser.jobTitle || '');
    const [isSaving, setIsSaving] = useState(false);
    const [saved, setSaved] = useState(false);
    const dropdownRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        setProfileName(currentUser.name || '');
        setProfileAvatar(currentUser.avatar || '');
        setProfileJobTitle(currentUser.jobTitle || '');
    }, [currentUser]);

    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
                setIsOpen(false);
                setIsEditing(false);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    const handleSave = async () => {
        setIsSaving(true);
        try {
            await StorageService.updateMemberMetrics(currentUser.id, {
                name: profileName.trim() || currentUser.name,
                avatar: profileAvatar.trim().toUpperCase().substring(0, 2) || currentUser.avatar,
                jobTitle: profileJobTitle.trim() || currentUser.jobTitle
            });
            setSaved(true);
            setTimeout(() => {
                setSaved(false);
                setIsEditing(false);
            }, 1500);
        } catch (e) {
            console.error('Failed to update profile:', e);
            alert('Failed to save profile. Please try again.');
        } finally {
            setIsSaving(false);
        }
    };

    return (
        <div className="relative" ref={dropdownRef}>
            {/* Avatar Button */}
            <button
                onClick={() => setIsOpen(!isOpen)}
                className="h-10 w-10 rounded-xl bg-slate-900 flex items-center justify-center text-white font-black text-xs shadow-md border-2 border-white ring-1 ring-slate-100 hover:ring-brand-navy transition-all cursor-pointer"
            >
                {currentUser.avatar}
            </button>

            {/* Dropdown Menu */}
            {isOpen && (
                <div className="absolute right-0 top-12 w-80 bg-white rounded-2xl shadow-2xl border border-slate-100 overflow-hidden z-50 animate-fade-in">
                    {!isEditing ? (
                        <>
                            {/* Profile Summary */}
                            <div className="p-5 bg-slate-50 border-b border-slate-100">
                                <div className="flex items-center gap-4">
                                    <div className="h-14 w-14 rounded-xl bg-brand-navy text-white flex items-center justify-center text-xl font-black">
                                        {currentUser.avatar}
                                    </div>
                                    <div className="flex-grow">
                                        <p className="font-black text-slate-900 text-sm">{currentUser.name}</p>
                                        <p className="text-xs text-slate-500">{currentUser.email}</p>
                                        <div className="flex items-center gap-2 mt-1">
                                            <span className={`text-[8px] font-black px-1.5 py-0.5 rounded border ${currentUser.role === 'ADMIN' ? 'border-brand-red bg-red-50 text-brand-red' : currentUser.role === 'MANAGER' ? 'border-amber-500 bg-amber-50 text-amber-600' : 'border-slate-200 text-slate-400'}`}>
                                                {currentUser.role}
                                            </span>
                                            {currentUser.jobTitle && (
                                                <span className="text-[9px] text-slate-400">{currentUser.jobTitle}</span>
                                            )}
                                        </div>
                                    </div>
                                </div>
                            </div>

                            {/* Menu Options */}
                            <div className="p-2">
                                <button
                                    onClick={() => setIsEditing(true)}
                                    className="w-full flex items-center gap-3 px-4 py-3 text-left text-sm font-semibold text-slate-700 hover:bg-slate-50 rounded-xl transition-colors"
                                >
                                    <svg className="w-4 h-4 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                                    </svg>
                                    Edit Profile
                                </button>
                                <button
                                    onClick={onLogout}
                                    className="w-full flex items-center gap-3 px-4 py-3 text-left text-sm font-semibold text-brand-red hover:bg-red-50 rounded-xl transition-colors"
                                >
                                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
                                    </svg>
                                    Sign Out
                                </button>
                            </div>
                        </>
                    ) : (
                        /* Edit Profile Form */
                        <div className="p-5">
                            <div className="flex items-center justify-between mb-4">
                                <h3 className="font-black text-slate-900 uppercase text-xs tracking-widest">Edit Profile</h3>
                                <button
                                    onClick={() => setIsEditing(false)}
                                    className="text-slate-400 hover:text-slate-600 transition-colors"
                                >
                                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
                                    </svg>
                                </button>
                            </div>

                            {/* Avatar Preview */}
                            <div className="flex justify-center mb-4">
                                <div className="h-16 w-16 rounded-xl bg-brand-navy text-white flex items-center justify-center text-2xl font-black">
                                    {profileAvatar || currentUser.avatar || '??'}
                                </div>
                            </div>

                            <div className="space-y-3">
                                <div>
                                    <label className="block text-[9px] font-black uppercase text-slate-400 tracking-widest mb-1">Display Name</label>
                                    <input
                                        type="text"
                                        value={profileName}
                                        onChange={e => setProfileName(e.target.value)}
                                        className="w-full px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm font-semibold outline-none focus:border-brand-navy transition-all"
                                    />
                                </div>
                                <div>
                                    <label className="block text-[9px] font-black uppercase text-slate-400 tracking-widest mb-1">Avatar Initials</label>
                                    <input
                                        type="text"
                                        value={profileAvatar}
                                        onChange={e => setProfileAvatar(e.target.value.toUpperCase().substring(0, 2))}
                                        maxLength={2}
                                        className="w-full px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm font-semibold outline-none focus:border-brand-navy transition-all uppercase"
                                    />
                                </div>
                                <div>
                                    <label className="block text-[9px] font-black uppercase text-slate-400 tracking-widest mb-1">Job Title</label>
                                    <input
                                        type="text"
                                        value={profileJobTitle}
                                        onChange={e => setProfileJobTitle(e.target.value)}
                                        className="w-full px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm font-semibold outline-none focus:border-brand-navy transition-all"
                                    />
                                </div>
                            </div>

                            <div className="mt-4 flex gap-2">
                                <button
                                    onClick={() => setIsEditing(false)}
                                    className="flex-1 py-2.5 text-xs font-bold text-slate-500 bg-slate-100 rounded-xl hover:bg-slate-200 transition-colors"
                                >
                                    Cancel
                                </button>
                                <button
                                    onClick={handleSave}
                                    disabled={isSaving}
                                    className="flex-[2] py-2.5 text-xs font-black text-white bg-brand-navy rounded-xl hover:bg-black transition-colors disabled:opacity-50"
                                >
                                    {isSaving ? 'Saving...' : saved ? '✓ Saved!' : 'Save Changes'}
                                </button>
                            </div>
                        </div>
                    )}
                </div>
            )}
        </div>
    );
};

export default ProfileDropdown;
