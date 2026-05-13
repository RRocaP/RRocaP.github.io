# Interactive Research Visualization Components

This directory contains interactive data visualization components for Ramon's portfolio website, built with React and D3.js.

## Components Overview

### 1. Antimicrobial Resistance Timeline (`AntimicrobialResistanceTimeline.tsx`)
- **Purpose**: Shows the historical timeline of antibiotic introduction and resistance emergence
- **Features**:
  - Interactive timeline bars showing time from introduction to resistance
  - Hover effects revealing detailed information about each antibiotic
  - Visual comparison of different antibiotic categories
  - Highlights Ramon's approach as a solution

### 2. Protein Engineering Interactive (`ProteinEngineeringInteractive.tsx`)
- **Purpose**: Demonstrates modular protein design through an interactive builder
- **Features**:
  - Clickable protein domains that can be combined
  - Real-time visualization of assembled proteins
  - Effectiveness metrics for different combinations
  - Educational steps explaining the design process

### 3. Gene Therapy Visualization (`GeneTherapyVisualization.tsx`)
- **Purpose**: Compares AAV vectors and their organ targeting capabilities
- **Features**:
  - Interactive body map showing organ targeting
  - Vector comparison mode with efficiency charts
  - Real-world success metrics
  - Highlights Ramon's CAR-T innovations

### 4. Research Impact Dashboard (`ResearchImpactDashboard.tsx`)
- **Purpose**: Displays research metrics and collaboration networks
- **Features**:
  - Citation growth over time (annual and cumulative)
  - Interactive collaboration network diagram
  - Real-world application tracking
  - Impact metrics visualization

## Technical Stack

- **React**: Component framework
- **D3.js**: Data visualization library
- **TypeScript**: Type safety
- **Astro**: Framework integration

## Usage

Each React component has a corresponding Astro wrapper for integration:
- `AntimicrobialTimeline.astro`
- `ProteinEngineering.astro`
- `GeneTherapy.astro`
- `ResearchImpact.astro`

To use in an Astro page:
```astro
---
import AntimicrobialTimeline from '../components/AntimicrobialTimeline.astro';
---

<AntimicrobialTimeline />
```

## Styling

Components use inline styles for encapsulation and include responsive design for mobile devices.

## Performance Considerations

- Components are lazy-loaded on the visualization page
- D3 visualizations are optimized for smooth interactions
- Responsive design ensures good mobile performance

## Future Enhancements

- Add animation transitions between states
- Include more detailed data sources
- Add export functionality for visualizations
- Implement dark mode support