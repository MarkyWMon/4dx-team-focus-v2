import React, { useEffect, useState } from 'react';
import { Achievement } from '../types';
import { PartyPopper } from 'lucide-react';

interface AchievementToastProps {
    achievement: Achievement | null;
    onClose: () => void;
}

const AchievementToast: React.FC<AchievementToastProps> = ({ achievement, onClose }) => {
    const [visible, setVisible] = useState(false);

    useEffect(() => {
        if (achievement) {
            setVisible(true);
            const timer = setTimeout(() => {
                setVisible(false);
                setTimeout(onClose, 600); // Wait for exit animation
            }, 5000);
            return () => clearTimeout(timer);
        }
    }, [achievement, onClose]);

    if (!achievement) return null;

    return (
        <div className={`fixed bottom-8 right-8 z-[100] transition-all duration-500 ${visible ? 'translate-x-0 opacity-100' : 'translate-x-[120%] opacity-0'}`}>
            <div className="glass-toast p-1 rounded-[2rem] shadow-2xl flex items-center gap-4 pr-8 border border-white/20">
                <div className="h-16 w-16 bg-gradient-to-br from-brand-orange to-brand-red rounded-[1.75rem] flex items-center justify-center shadow-lg relative overflow-hidden">
                    <span className="text-3xl relative z-10">{achievement.icon}</span>
                    <div className="absolute inset-0 bg-white/20 animate-pulse"></div>
                </div>

                <div className="flex flex-col">
                    <div className="flex items-center gap-2 mb-1">
                        <PartyPopper className="h-3 w-3 text-brand-orange" />
                        <span className="text-[10px] font-black text-white/50 uppercase tracking-[0.3em]">Achievement Unlocked</span>
                    </div>
                    <h4 className="text-white font-display font-black text-lg tracking-tight uppercase leading-none">{achievement.title}</h4>
                    <p className="text-white/60 text-[10px] font-bold mt-1 max-w-[180px] leading-tight">{achievement.description}</p>
                </div>

                <button
                    onClick={() => { setVisible(false); setTimeout(onClose, 600); }}
                    className="ml-4 h-8 w-8 rounded-full bg-white/5 flex items-center justify-center text-white/30 hover:bg-white/10 hover:text-white transition-all"
                >
                    ✕
                </button>
            </div>
        </div>
    );
};

export default AchievementToast;
