import { defineConfig } from 'astro/config';
import react from '@astrojs/react';
import tailwind from '@astrojs/tailwind';
import sitemap from '@astrojs/sitemap';

const isVercel = !!process.env.VERCEL;

export default defineConfig({
  site: isVercel ? 'https://rrocap-portfolio.vercel.app' : 'https://rrocap.github.io',
  base: isVercel ? '/' : '/Portfolio',
  trailingSlash: 'always',
  output: 'static',
  integrations: [
    react(),
    tailwind({ applyBaseStyles: false }),
    sitemap({ serialize(item){ return { ...item, changefreq: 'monthly', priority: 0.8 }; } })
  ],
  vite: {
    build: {
      target: 'es2020',
      minify: 'terser',
      terserOptions: {
        compress: {
          drop_console: true,
          drop_debugger: true,
          pure_funcs: ['console.log', 'console.debug', 'console.trace'],
        },
        mangle: {
          safari10: true,
        },
      },
      rollupOptions: {
        output: {
          manualChunks: (id) => {
            // Vendor libraries - separate by size/priority
            if (id.includes('node_modules')) {
              if (id.includes('react') || id.includes('react-dom')) {
                return 'vendor-react';
              }
              if (id.includes('d3')) {
                return 'vendor-d3';
              }
              if (id.includes('gsap')) {
                return 'vendor-gsap';  
              }
              if (id.includes('fuse.js')) {
                return 'vendor-search';
              }
              // Other small vendor libs
              return 'vendor-utils';
            }
            
            // Feature-based splitting
            if (id.includes('/components/') && id.includes('.tsx')) {
              if (id.includes('Hero') && !id.includes('HeroFinal')) {
                return 'features-hero';
              }
              if (id.includes('Project') || id.includes('Showcase')) {
                return 'features-projects';
              }
              if (id.includes('Timeline') || id.includes('Animation')) {
                return 'features-visualizations';
              }
              if (id.includes('Blog') || id.includes('Search')) {
                return 'features-content';
              }
              if (id.includes('Contact') || id.includes('Testimonials')) {
                return 'features-interactive';
              }
              // Other React components
              return 'components-misc';
            }
            
            // Astro components by feature
            if (id.includes('/components/') && id.includes('.astro')) {
              if (id.includes('Navigation') || id.includes('Layout')) {
                return 'layout-components';
              }
              if (id.includes('Performance') || id.includes('Analytics')) {
                return 'utils-monitoring';
              }
            }
            
            // Utils by category
            if (id.includes('/utils/')) {
              if (id.includes('animation') || id.includes('visualization')) {
                return 'utils-graphics';
              }
              if (id.includes('performance') || id.includes('analytics')) {
                return 'utils-monitoring';
              }
              if (id.includes('seo') || id.includes('theme')) {
                return 'utils-meta';
              }
              return 'utils-core';
            }
            
            // Keep main entry point and critical files together
            return null;
          },
        },
      },
    },
    ssr: {
      noExternal: ['d3'],
    },
    define: {
      __DEV__: false,
    },
  },
  build: {
    inlineStylesheets: 'auto',
  },
});
