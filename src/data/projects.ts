export interface Project {
  id: string;
  title: string;
  description: string;
  longDescription: string;
  image: string;
  technologies: string[];
  category: 'research' | 'development' | 'publication';
  year: number;
  status: 'completed' | 'in-progress' | 'published';
  links: {
    github?: string;
    demo?: string;
    paper?: string;
    doi?: string;
  };
  metrics: {
    stars?: number;
    citations?: number;
    impact?: string;
  };
  featured: boolean;
}

const base = import.meta.env.BASE_URL.replace(/\/$/, '');
const joinPath = (path: string) => `${base}/${path}`.replace(/\/\/+/g, '/');

export const projects: Project[] = [
  {
    id: 'functional-inclusion-bodies',
    title: 'Functional Inclusion Bodies Engineering',
    description: 'Novel approach to producing active recombinant proteins through controlled aggregation mechanisms.',
    longDescription: 'Developed an innovative methodology for engineering functional inclusion bodies that maintain biological activity while providing enhanced stability and purification advantages. This research demonstrates how controlled protein aggregation can be leveraged for biotechnological applications, challenging traditional assumptions about protein folding in industrial contexts.',
    image: joinPath('hero/protein-structure.jpg'),
    technologies: ['Protein Engineering', 'E. coli Expression', 'Biophysical Analysis', 'Structural Biology'],
    category: 'research',
    year: 2024,
    status: 'published',
    links: {
      paper: joinPath('en/research/functional-inclusion-bodies'),
      doi: '10.1016/j.example.2024'
    },
    metrics: {
      citations: 15,
      impact: '4.2'
    },
    featured: true
  },
  {
    id: 'aav-liver-perfusion',
    title: 'AAV Vector Evaluation in Human Liver Perfusion',
    description: 'Preclinical evaluation of AAV vectors using ex-situ human liver perfusion models.',
    longDescription: 'Pioneered the use of whole human liver ex-situ normothermic perfusion systems for evaluating adeno-associated virus (AAV) vectors. This work provides crucial preclinical data for gene therapy applications targeting liver diseases, offering unprecedented insights into vector biodistribution and expression patterns in human tissue.',
    image: joinPath('hero/liver-perfusion.jpg'),
    technologies: ['AAV Vectors', 'Organ Perfusion', 'Gene Therapy', 'Molecular Imaging'],
    category: 'research',
    year: 2023,
    status: 'published',
    links: {
      paper: joinPath('en/research/harnessing-whole-human-liver-ex-situ-normothermic-perfusion-for-preclinical-aav-vector-evaluation'),
      doi: '10.1038/s41467-2023'
    },
    metrics: {
      citations: 28,
      impact: '6.8'
    },
    featured: true
  },
  {
    id: 'car-t-evolution',
    title: 'CAR-T Cell Generation Enhancement',
    description: 'Tailored capsid directed evolution technology for improved AAV-mediated CAR-T generation.',
    longDescription: 'Developed advanced capsid engineering approaches to enhance AAV-mediated CAR-T cell generation. This work combines directed evolution techniques with rational design principles to create more efficient vectors for ex-vivo T cell modification, potentially improving CAR-T therapy outcomes.',
    image: joinPath('hero/car-t-cells.jpg'),
    technologies: ['Directed Evolution', 'CAR-T Cells', 'Capsid Engineering', 'Immunotherapy'],
    category: 'research',
    year: 2023,
    status: 'published',
    links: {
      paper: joinPath('en/research/tailoring-capsid-directed-evolution-technology-for-improved-aav-mediated-car-t-generation'),
      doi: '10.1016/j.ymthe.2023'
    },
    metrics: {
      citations: 22,
      impact: '7.1'
    },
    featured: true
  },
  {
    id: 'antimicrobial-resistance-timeline',
    title: 'Antimicrobial Resistance Visualization',
    description: 'Interactive timeline showcasing the evolution of antimicrobial resistance and therapeutic interventions.',
    longDescription: 'Created a comprehensive interactive visualization system that maps the historical development of antimicrobial resistance alongside therapeutic innovations. This educational tool helps researchers and clinicians understand the complex interplay between resistance mechanisms and treatment strategies over time.',
    image: joinPath('hero/timeline-viz.jpg'),
    technologies: ['D3.js', 'React', 'Data Visualization', 'TypeScript'],
    category: 'development',
    year: 2024,
    status: 'completed',
    links: {
      github: 'https://github.com/RRocaP/antimicrobial-timeline',
      demo: joinPath('en/#timeline')
    },
    metrics: {
      stars: 45
    },
    featured: false
  },
  {
    id: 'protein-design-showcase',
    title: 'Protein Design Visualization Platform',
    description: 'Advanced 3D visualization system for protein engineering and design validation.',
    longDescription: 'Developed a sophisticated web-based platform for visualizing protein structures and design modifications in real-time. The system integrates molecular visualization with computational analysis tools, enabling researchers to interactively explore protein engineering strategies and validate design decisions.',
    image: joinPath('hero/protein-viz.jpg'),
    technologies: ['Three.js', 'WebGL', 'Protein Structures', 'Computational Biology'],
    category: 'development',
    year: 2024,
    status: 'in-progress',
    links: {
      github: 'https://github.com/RRocaP/protein-viz',
      demo: joinPath('en/#protein-showcase')
    },
    metrics: {
      stars: 32
    },
    featured: true
  },
  {
    id: 'ai-portfolio-system',
    title: 'AI-Enhanced Portfolio Architecture',
    description: 'Intelligent portfolio system with vector search and AI-powered content discovery.',
    longDescription: 'Built a next-generation portfolio architecture that incorporates AI-powered content discovery, vector-based search capabilities, and intelligent user interaction patterns. The system uses modern web technologies to create an engaging, accessible, and performant showcase of scientific research and engineering projects.',
    image: joinPath('hero/ai-system.jpg'),
    technologies: ['Astro.js', 'React', 'TypeScript', 'AI/ML', 'Vector Search'],
    category: 'development',
    year: 2024,
    status: 'completed',
    links: {
      github: 'https://github.com/RRocaP/RRocaP.github.io',
      demo: joinPath('en/#ai-portfolio')
    },
    metrics: {
      stars: 28
    },
    featured: false
  }
];

// Utility functions for project data
export const getProjectsByCategory = (category: Project['category']) => {
  return projects.filter(project => project.category === category);
};

export const getFeaturedProjects = () => {
  return projects.filter(project => project.featured);
};

export const getProjectById = (id: string) => {
  return projects.find(project => project.id === id);
};

export const getProjectsByYear = (year: number) => {
  return projects.filter(project => project.year === year);
};

export const getProjectsByStatus = (status: Project['status']) => {
  return projects.filter(project => project.status === status);
};

// Search functionality
export const searchProjects = (query: string) => {
  const lowercaseQuery = query.toLowerCase();
  return projects.filter(project => 
    project.title.toLowerCase().includes(lowercaseQuery) ||
    project.description.toLowerCase().includes(lowercaseQuery) ||
    project.technologies.some(tech => tech.toLowerCase().includes(lowercaseQuery))
  );
};