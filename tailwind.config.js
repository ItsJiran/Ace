// tailwind.config.js
module.exports = {
  content: ['./src/**/*.{js,ts,jsx,tsx}', './src-web/**/*.{html,js}'],
  theme: {
    extend: {
      colors: {
        glass: {
          bg:        'rgba(255, 255, 255, 0.34)',
          'bg-deep': 'rgba(225, 232, 248, 0.24)',
          border:    'rgba(255, 255, 255, 0.56)',
          'border-muted': 'rgba(185, 198, 222, 0.32)',
          text:      'rgba(42, 50, 78, 0.90)',
          'text-muted': 'rgba(88, 102, 145, 0.60)',
        },
        scene: {
          base:  '#c4cedd',
          mid:   '#d2daea',
          light: '#dde4f0',
          deep:  '#b8c5d6',
        },
        accent: {
          blue:       'rgba(118, 140, 210, 0.52)',
          'blue-border': 'rgba(158, 178, 230, 0.50)',
          send:       'rgba(120, 142, 212, 0.54)',
        },
        bubble: {
          agent:        'rgba(255, 255, 255, 0.44)',
          'agent-border': 'rgba(255, 255, 255, 0.60)',
          user:         'rgba(122, 142, 205, 0.36)',
          'user-border': 'rgba(155, 175, 228, 0.44)',
        },
        status: {
          online: '#6abf8a',
        },
      },
      backdropBlur: {
        glass: '20px',
      },
      borderRadius: {
        panel:  '20px',
        bubble: '14px',
        pill:   '20px',
        btn:    '11px',
        chip:   '8px',
      },
      boxShadow: {
        // "panel-fade":  '0 2px 0 0 rgba(255, 255, 255, 0.47) inset, 0 -1px 0 0 rgba(150, 165, 195, 0.07) inset, 0 12px 40px rgba(80, 95, 130, 0.09), 0 2px 10px rgba(80, 95, 130, 0.06)',
        // panel:  '0 2px 0 0 rgba(255,255,255,0.65) inset, 0 -1px 0 0 rgba(150,165,195,0.18) inset, 0 12px 40px rgba(80,95,130,0.20), 0 2px 10px rgba(80,95,130,0.10)',
        // bubble: '0 2px 8px rgba(85,100,140,0.10)',
        // send:   '0 2px 6px rgba(85,108,178,0.22), 0 1px 0 rgba(255,255,255,0.50) inset',
      },
      backgroundImage: {
        'scene-gradient':  'linear-gradient(145deg, #b8c5d8 0%, #cdd6e5 30%, #dde3ef 55%, #c9d4e4 80%, #bdc9dc 100%)',
        'panel-gradient':  'linear-gradient(160deg, rgba(255,255,255,0.38) 0%, rgba(230,234,242,0.26) 100%)',
        'send-gradient':   'linear-gradient(145deg, rgba(125,145,215,0.56), rgba(98,118,190,0.46))',
        'avatar-agent':    'linear-gradient(140deg, rgba(200,212,238,0.72), rgba(170,188,225,0.52))',
        'avatar-user':     'linear-gradient(140deg, rgba(125,145,205,0.60), rgba(105,125,185,0.48))',
        'bubble-agent':    'linear-gradient(150deg, rgba(255,255,255,0.46), rgba(228,234,250,0.30))',
        'bubble-user':     'linear-gradient(150deg, rgba(125,145,205,0.38), rgba(105,125,190,0.28))',
      },
      fontSize: {
        '2xs': ['10.5px', { lineHeight: '1.4' }],
        'xs':  ['11px',   { lineHeight: '1.45' }],
        'sm':  ['12px',   { lineHeight: '1.5' }],
        'ui':  ['13px',   { lineHeight: '1.55' }],
        'inp': ['13.5px', { lineHeight: '1.5' }],
      },
    },
  },
  plugins: [],
}