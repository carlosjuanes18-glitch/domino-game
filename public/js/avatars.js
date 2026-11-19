// Biblioteca de Avatares SVG Estilizados (Masculinos y Femeninos)
const AVATARS = {
  male_1: {
    id: 'male_1',
    name: 'Don Roberto',
    gender: 'm',
    color: '#2563eb',
    svg: `<svg viewBox="0 0 100 100" class="w-full h-full">
      <circle cx="50" cy="50" r="46" fill="#1e293b" stroke="#3b82f6" stroke-width="4"/>
      <!-- Piel -->
      <path d="M50 24 C40 24 34 32 34 46 C34 60 41 68 50 68 C59 68 66 60 66 46 C66 32 60 24 50 24 Z" fill="#fbd2a4"/>
      <!-- Cabello oscuro peinado -->
      <path d="M33 38 C33 24 40 18 50 18 C60 18 67 24 67 38 C63 32 55 30 50 30 C45 30 37 32 33 38 Z" fill="#2d2218"/>
      <!-- Cejas y Ojos -->
      <path d="M40 40 L46 39 M54 39 L60 40" stroke="#2d2218" stroke-width="2" stroke-linecap="round"/>
      <circle cx="43" cy="45" r="2.5" fill="#1e293b"/>
      <circle cx="57" cy="45" r="2.5" fill="#1e293b"/>
      <!-- Bigote clásico -->
      <path d="M43 55 Q50 52 57 55 Q50 58 43 55 Z" fill="#2d2218"/>
      <!-- Sonrisa -->
      <path d="M46 60 Q50 63 54 60" stroke="#991b1b" stroke-width="2" fill="none" stroke-linecap="round"/>
      <!-- Camisa azul con cuello -->
      <path d="M28 85 C30 72 38 68 50 68 C62 68 70 72 72 85 Z" fill="#2563eb"/>
      <polygon points="50,72 45,82 55,82" fill="#ffffff"/>
    </svg>`
  },
  female_1: {
    id: 'female_1',
    name: 'Doña Carmen',
    gender: 'f',
    color: '#ec4899',
    svg: `<svg viewBox="0 0 100 100" class="w-full h-full">
      <circle cx="50" cy="50" r="46" fill="#1e293b" stroke="#ec4899" stroke-width="4"/>
      <!-- Cabello largo castaño detrás -->
      <path d="M30 38 C28 55 28 68 32 75 C35 60 35 48 35 42 Z" fill="#6d3f23"/>
      <path d="M70 38 C72 55 72 68 68 75 C65 60 65 48 65 42 Z" fill="#6d3f23"/>
      <!-- Piel -->
      <path d="M50 24 C41 24 35 32 35 46 C35 59 42 67 50 67 C58 67 65 59 65 46 C65 32 59 24 50 24 Z" fill="#fddcb4"/>
      <!-- Cabello frontal con ondas -->
      <path d="M32 35 C32 20 40 16 50 16 C60 16 68 20 68 35 C64 28 56 26 50 26 C44 26 36 28 32 35 Z" fill="#6d3f23"/>
      <!-- Pendientes -->
      <circle cx="33" cy="52" r="3" fill="#fbbf24"/>
      <circle cx="67" cy="52" r="3" fill="#fbbf24"/>
      <!-- Ojos y Pestañas -->
      <path d="M39 42 Q43 39 47 42 M53 42 Q57 39 61 42" stroke="#451a03" stroke-width="1.8" fill="none" stroke-linecap="round"/>
      <circle cx="43" cy="45" r="2.5" fill="#451a03"/>
      <circle cx="57" cy="45" r="2.5" fill="#451a03"/>
      <path d="M46 43 L48 41 M54 41 L56 43" stroke="#451a03" stroke-width="1.5"/>
      <!-- Labios sonrientes -->
      <path d="M45 58 Q50 64 55 58 Q50 60 45 58" fill="#e11d48"/>
      <!-- Ropa elegante magenta -->
      <path d="M28 85 C30 72 38 68 50 68 C62 68 70 72 72 85 Z" fill="#db2777"/>
      <circle cx="50" cy="74" r="3" fill="#fde047"/>
    </svg>`
  },
  male_2: {
    id: 'male_2',
    name: 'Carlos Boina',
    gender: 'm',
    color: '#059669',
    svg: `<svg viewBox="0 0 100 100" class="w-full h-full">
      <circle cx="50" cy="50" r="46" fill="#1e293b" stroke="#10b981" stroke-width="4"/>
      <!-- Piel -->
      <path d="M50 26 C41 26 35 34 35 47 C35 60 42 68 50 68 C58 68 65 60 65 47 C65 34 59 26 50 26 Z" fill="#fed7aa"/>
      <!-- Boina clásica de dominocista -->
      <ellipse cx="50" cy="24" rx="24" ry="12" fill="#374151"/>
      <circle cx="50" cy="14" r="2.5" fill="#1f2937"/>
      <path d="M32 26 Q50 20 68 26 L66 30 Q50 24 34 30 Z" fill="#1f2937"/>
      <!-- Gafas modernas -->
      <rect x="37" y="41" width="11" height="9" rx="2" fill="none" stroke="#e5e7eb" stroke-width="2"/>
      <rect x="52" y="41" width="11" height="9" rx="2" fill="none" stroke="#e5e7eb" stroke-width="2"/>
      <line x1="48" y1="45" x2="52" y2="45" stroke="#e5e7eb" stroke-width="2"/>
      <circle cx="42.5" cy="45.5" r="2" fill="#1f2937"/>
      <circle cx="57.5" cy="45.5" r="2" fill="#1f2937"/>
      <!-- Barba cuidada -->
      <path d="M42 62 Q50 67 58 62 Q60 68 50 71 Q40 68 42 62 Z" fill="#4b5563"/>
      <!-- Guayabera verde esmeralda -->
      <path d="M27 85 C29 73 38 69 50 69 C62 69 71 73 73 85 Z" fill="#059669"/>
      <line x1="47" y1="70" x2="47" y2="85" stroke="#047857" stroke-width="2"/>
      <line x1="53" y1="70" x2="53" y2="85" stroke="#047857" stroke-width="2"/>
    </svg>`
  },
  female_2: {
    id: 'female_2',
    name: 'Sofía Dinámica',
    gender: 'f',
    color: '#8b5cf6',
    svg: `<svg viewBox="0 0 100 100" class="w-full h-full">
      <circle cx="50" cy="50" r="46" fill="#1e293b" stroke="#8b5cf6" stroke-width="4"/>
      <!-- Cabello oscuro recogido / coleta alta -->
      <circle cx="50" cy="18" r="9" fill="#171717"/>
      <path d="M50 26 C41 26 35 34 35 48 C35 60 42 67 50 67 C58 67 65 60 65 48 C65 34 59 26 50 26 Z" fill="#fbcfe8"/>
      <path d="M33 34 C33 22 40 18 50 18 C60 18 67 22 67 34 C63 28 56 26 50 26 C44 26 37 28 33 34 Z" fill="#171717"/>
      <!-- Ojos grandes y amigables -->
      <circle cx="43" cy="46" r="3" fill="#312e81"/>
      <circle cx="44" cy="45" r="1" fill="#ffffff"/>
      <circle cx="57" cy="46" r="3" fill="#312e81"/>
      <circle cx="58" cy="45" r="1" fill="#ffffff"/>
      <!-- Labios con brillo -->
      <path d="M46 58 Q50 63 54 58" stroke="#f43f5e" stroke-width="2.5" fill="none" stroke-linecap="round"/>
      <!-- Chaqueta violeta / hoodie -->
      <path d="M28 85 C30 71 39 67 50 67 C61 67 70 71 72 85 Z" fill="#7c3aed"/>
      <path d="M44 68 L50 78 L56 68 Z" fill="#c4b5fd"/>
    </svg>`
  },
  male_3: {
    id: 'male_3',
    name: 'Don Mateo',
    gender: 'm',
    color: '#f59e0b',
    svg: `<svg viewBox="0 0 100 100" class="w-full h-full">
      <circle cx="50" cy="50" r="46" fill="#1e293b" stroke="#f59e0b" stroke-width="4"/>
      <!-- Piel bronceada -->
      <path d="M50 25 C41 25 35 33 35 46 C35 59 42 68 50 68 C58 68 65 59 65 46 C65 33 59 25 50 25 Z" fill="#e0a96d"/>
      <!-- Sombrero panamá clásico -->
      <ellipse cx="50" cy="24" rx="27" ry="9" fill="#fef3c7" stroke="#d97706" stroke-width="1.5"/>
      <path d="M37 23 C37 14 43 12 50 12 C57 12 63 14 63 23 Z" fill="#fef3c7" stroke="#d97706" stroke-width="1.5"/>
      <rect x="36" y="20" width="28" height="4" fill="#991b1b"/>
      <!-- Ojos astutos y sonrisa pícara -->
      <circle cx="43" cy="45" r="2.5" fill="#1f2937"/>
      <circle cx="57" cy="45" r="2.5" fill="#1f2937"/>
      <path d="M44 58 Q52 64 56 56" stroke="#451a03" stroke-width="2" fill="none" stroke-linecap="round"/>
      <!-- Camisa amarilla suave -->
      <path d="M27 85 C29 72 38 68 50 68 C62 68 71 72 73 85 Z" fill="#f59e0b"/>
      <line x1="50" y1="70" x2="50" y2="85" stroke="#b45309" stroke-width="2"/>
    </svg>`
  },
  female_3: {
    id: 'female_3',
    name: 'Lucía Maestra',
    gender: 'f',
    color: '#06b6d4',
    svg: `<svg viewBox="0 0 100 100" class="w-full h-full">
      <circle cx="50" cy="50" r="46" fill="#1e293b" stroke="#06b6d4" stroke-width="4"/>
      <!-- Piel clara -->
      <path d="M50 24 C41 24 35 32 35 46 C35 59 42 67 50 67 C58 67 65 59 65 46 C65 32 59 24 50 24 Z" fill="#fed7aa"/>
      <!-- Cabello rubio corto estilo bob -->
      <path d="M31 38 C31 20 40 16 50 16 C60 16 69 20 69 38 C69 50 67 55 65 58 C62 38 58 26 50 26 C42 26 38 38 35 58 C33 55 31 50 31 38 Z" fill="#f59e0b"/>
      <!-- Gafas de pasta turquesa -->
      <circle cx="43" cy="45" r="6" fill="none" stroke="#0891b2" stroke-width="2"/>
      <circle cx="57" cy="45" r="6" fill="none" stroke="#0891b2" stroke-width="2"/>
      <line x1="49" y1="45" x2="51" y2="45" stroke="#0891b2" stroke-width="2"/>
      <circle cx="43" cy="45" r="2" fill="#0e7490"/>
      <circle cx="57" cy="45" r="2" fill="#0e7490"/>
      <!-- Sonrisa amable -->
      <path d="M46 58 Q50 62 54 58" stroke="#be123c" stroke-width="2" fill="none" stroke-linecap="round"/>
      <!-- Blusa cian -->
      <path d="M28 85 C30 72 38 68 50 68 C62 68 70 72 72 85 Z" fill="#0891b2"/>
    </svg>`
  },
  male_4: {
    id: 'male_4',
    name: 'Javier Campeón',
    gender: 'm',
    color: '#ef4444',
    svg: `<svg viewBox="0 0 100 100" class="w-full h-full">
      <circle cx="50" cy="50" r="46" fill="#1e293b" stroke="#ef4444" stroke-width="4"/>
      <!-- Piel -->
      <path d="M50 25 C41 25 35 33 35 47 C35 60 42 68 50 68 C58 68 65 60 65 47 C65 33 59 25 50 25 Z" fill="#fbcfe8"/>
      <!-- Gorra hacia atrás roja -->
      <path d="M33 30 C33 18 42 16 50 16 C58 16 67 18 67 30 Z" fill="#dc2626"/>
      <ellipse cx="50" cy="30" rx="18" ry="4" fill="#991b1b"/>
      <!-- Cejas decididas y ojos -->
      <path d="M39 42 L46 44 M54 44 L61 42" stroke="#1f2937" stroke-width="2.2" stroke-linecap="round"/>
      <circle cx="43" cy="47" r="2.5" fill="#1f2937"/>
      <circle cx="57" cy="47" r="2.5" fill="#1f2937"/>
      <!-- Sonrisa de confianza -->
      <path d="M45 59 Q50 63 55 59" stroke="#991b1b" stroke-width="2.5" fill="none" stroke-linecap="round"/>
      <!-- Camiseta deportiva roja -->
      <path d="M28 85 C30 72 38 68 50 68 C62 68 70 72 72 85 Z" fill="#dc2626"/>
      <circle cx="50" cy="76" r="4" fill="#ffffff"/>
    </svg>`
  },
  female_4: {
    id: 'female_4',
    name: 'Valentina Pro',
    gender: 'f',
    color: '#14b8a6',
    svg: `<svg viewBox="0 0 100 100" class="w-full h-full">
      <circle cx="50" cy="50" r="46" fill="#1e293b" stroke="#14b8a6" stroke-width="4"/>
      <!-- Cabello rizado castaño -->
      <circle cx="34" cy="34" r="8" fill="#451a03"/>
      <circle cx="66" cy="34" r="8" fill="#451a03"/>
      <circle cx="31" cy="46" r="8" fill="#451a03"/>
      <circle cx="69" cy="46" r="8" fill="#451a03"/>
      <!-- Piel canela -->
      <path d="M50 25 C41 25 35 33 35 46 C35 59 42 67 50 67 C58 67 65 59 65 46 C65 33 59 25 50 25 Z" fill="#d97706"/>
      <path d="M34 26 C34 16 42 16 50 16 C58 16 66 16 66 26 Z" fill="#451a03"/>
      <!-- Ojos expresivos -->
      <circle cx="43" cy="45" r="2.7" fill="#1f2937"/>
      <circle cx="57" cy="45" r="2.7" fill="#1f2937"/>
      <!-- Labial coral -->
      <path d="M45 57 Q50 62 55 57" stroke="#fb7185" stroke-width="2.5" fill="none" stroke-linecap="round"/>
      <!-- Ropa verde azulado -->
      <path d="M28 85 C30 72 38 68 50 68 C62 68 70 72 72 85 Z" fill="#0d9488"/>
      <polygon points="50,70 45,78 55,78" fill="#5eead4"/>
    </svg>`
  }
};

window.AVATARS = AVATARS;

