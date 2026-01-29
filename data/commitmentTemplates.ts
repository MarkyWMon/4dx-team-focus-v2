import { CommitmentTemplate } from '../types';

export const COMMITMENT_TEMPLATES: CommitmentTemplate[] = [
    // Floor Walks - BHASVIC Specific
    {
        id: 'tmpl-floor-copper',
        title: 'Copper Building Check',
        description: 'Walk the Copper Building data outlets and AV. Ensure teaching walls are tidy and cables are managed.',
        category: 'floor_walk',
        icon: '🧱',
        estimatedMinutes: 20,
        potentialImpact: 'Maintain high standards in newer teaching spaces',
        suggestedFrequency: 'weekly'
    },
    {
        id: 'tmpl-floor-elms',
        title: 'Elms Building Lab Sweep',
        description: 'Check IT health in Elms Building labs. Verify projector filters are clean and log any faulty peripherals.',
        category: 'floor_walk',
        icon: '🌳',
        estimatedMinutes: 30,
        potentialImpact: 'Prevent lesson disruptions in high-demand labs',
        suggestedFrequency: 'weekly'
    },
    {
        id: 'tmpl-floor-house',
        title: 'College House Quick Check',
        description: 'Sweep College House admin offices. Ask 3 staff members "Is there anything small niggling you with IT?"',
        category: 'floor_walk',
        icon: '🏛️',
        estimatedMinutes: 15,
        potentialImpact: 'Build rapport and catch "silent" issues',
        suggestedFrequency: 'biweekly'
    },
    {
        id: 'tmpl-floor-main',
        title: 'Main Building Corridor Audit',
        description: 'Check digital signage and hallway PC kiosks in Main Building. Ensure screens are active and untampered.',
        category: 'floor_walk',
        icon: '🏫',
        estimatedMinutes: 20,
        potentialImpact: 'Ensure visible tech is working for visitors/students',
        suggestedFrequency: 'weekly'
    },
    {
        id: 'tmpl-floor-services',
        title: 'Student Services Drop-in',
        description: 'Check tech in Student Services centre. Ensure self-service terminals are responsive.',
        category: 'floor_walk',
        icon: '💁',
        estimatedMinutes: 15,
        potentialImpact: 'Support student-facing operations',
        suggestedFrequency: 'monthly'
    },

    // Preventive Maintenance
    {
        id: 'tmpl-maint-huts',
        title: 'The Huts Connectivity Check',
        description: 'Verify Wi-Fi signal strength and patch panel tidiness in The Huts classrooms.',
        category: 'preventive_maintenance',
        icon: '🛖',
        estimatedMinutes: 25,
        potentialImpact: 'Improve reliability in outlier buildings',
        suggestedFrequency: 'monthly'
    },
    {
        id: 'tmpl-maint-av',
        title: 'Teaching Wall Health Check',
        description: 'Test sound, video, and touch inputs on Clevertouch screens in [Select Building]. Clean screens.',
        category: 'preventive_maintenance',
        icon: '📺',
        estimatedMinutes: 40,
        potentialImpact: 'Prevent "AV not working" emergency tickets',
        suggestedFrequency: 'biweekly'
    },
    {
        id: 'tmpl-maint-printers',
        title: 'Printer Station Audit',
        description: 'Check toner levels, paper trays, and clear any debris from paper paths in library/corridor MFDs.',
        category: 'preventive_maintenance',
        icon: '🖨️',
        estimatedMinutes: 25,
        potentialImpact: 'Reduce paper jam tickets',
        suggestedFrequency: 'weekly'
    },

    // Documentation
    {
        id: 'tmpl-doc-guide',
        title: 'Create/Update Help Guide',
        description: 'Write or update one knowledge base article for a top-5 recurring ticket category (e.g. BYOD Wi-Fi).',
        category: 'documentation',
        icon: '📝',
        estimatedMinutes: 60,
        potentialImpact: 'Enable self-service resolution',
        suggestedFrequency: 'weekly'
    },
    {
        id: 'tmpl-doc-audit',
        title: 'Guidance Audit',
        description: 'Review 5 existing help guides to ensure screenshots match current software versions.',
        category: 'documentation',
        icon: '🔍',
        estimatedMinutes: 30,
        potentialImpact: 'Maintain trust in support docs',
        suggestedFrequency: 'monthly'
    },

    // Training & People
    {
        id: 'tmpl-train-micro',
        title: 'Micro-Training Delivery',
        description: 'Spend 10 minutes with a department showing them a "did you know" tip (e.g. Teams shortcuts).',
        category: 'training',
        icon: '🎓',
        estimatedMinutes: 15,
        potentialImpact: 'Increase user capability',
        suggestedFrequency: 'biweekly'
    },
    {
        id: 'tmpl-train-induct',
        title: 'New Staff Check-in',
        description: 'Visit staff who joined this term. Verify they are comfortable with core BHASVIC systems.',
        category: 'training',
        icon: '👋',
        estimatedMinutes: 20,
        potentialImpact: 'Prevent onboarding friction',
        suggestedFrequency: 'monthly'
    }
];

export const getTemplateCategoryLabel = (cat: string) => {
    switch (cat) {
        case 'floor_walk': return 'Floor Walk';
        case 'preventive_maintenance': return 'Maintenance';
        case 'documentation': return 'Documentation';
        case 'training': return 'Training';
        case 'infrastructure': return 'Infrastructure';
        default: return 'Other';
    }
};

export const getCategoryColor = (cat: string) => {
    switch (cat) {
        case 'floor_walk': return 'bg-blue-100 text-blue-700 border-blue-200';
        case 'preventive_maintenance': return 'bg-orange-100 text-orange-700 border-orange-200';
        case 'documentation': return 'bg-purple-100 text-purple-700 border-purple-200';
        case 'training': return 'bg-teal-100 text-teal-700 border-teal-200';
        default: return 'bg-slate-100 text-slate-700 border-slate-200';
    }
};
