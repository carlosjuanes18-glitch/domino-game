// Biblioteca de 16 Avatares Estilizados Neón
const AVATARS = {
  avatar_1: {
    id: 'avatar_1',
    name: 'Beatrix Kiddo',
    gender: 'f',
    color: '#eab308',
    img: '/images/avatars/avatar_1.png',
    svg: '<img src="/images/avatars/avatar_1.png" alt="Beatrix Kiddo" class="w-full h-full object-cover rounded-full" />'
  },
  avatar_2: {
    id: 'avatar_2',
    name: 'Bruce Lee',
    gender: 'm',
    color: '#06b6d4',
    img: '/images/avatars/avatar_2.png',
    svg: '<img src="/images/avatars/avatar_2.png" alt="Bruce Lee" class="w-full h-full object-cover rounded-full" />'
  },
  avatar_3: {
    id: 'avatar_3',
    name: 'Darth Vader',
    gender: 'm',
    color: '#ef4444',
    img: '/images/avatars/avatar_3.png',
    svg: '<img src="/images/avatars/avatar_3.png" alt="Darth Vader" class="w-full h-full object-cover rounded-full" />'
  },
  avatar_4: {
    id: 'avatar_4',
    name: 'Lara Croft',
    gender: 'f',
    color: '#f97316',
    img: '/images/avatars/avatar_4.png',
    svg: '<img src="/images/avatars/avatar_4.png" alt="Lara Croft" class="w-full h-full object-cover rounded-full" />'
  },
  avatar_5: {
    id: 'avatar_5',
    name: 'Peter Griffin',
    gender: 'm',
    color: '#22c55e',
    img: '/images/avatars/avatar_5.png',
    svg: '<img src="/images/avatars/avatar_5.png" alt="Peter Griffin" class="w-full h-full object-cover rounded-full" />'
  },
  avatar_6: {
    id: 'avatar_6',
    name: 'Rambo',
    gender: 'm',
    color: '#84cc16',
    img: '/images/avatars/avatar_6.png',
    svg: '<img src="/images/avatars/avatar_6.png" alt="Rambo" class="w-full h-full object-cover rounded-full" />'
  },
  avatar_7: {
    id: 'avatar_7',
    name: 'Neo',
    gender: 'm',
    color: '#a855f7',
    img: '/images/avatars/avatar_7.png',
    svg: '<img src="/images/avatars/avatar_7.png" alt="Neo" class="w-full h-full object-cover rounded-full" />'
  },
  avatar_8: {
    id: 'avatar_8',
    name: 'Cyborg Robot',
    gender: 'm',
    color: '#06b6d4',
    img: '/images/avatars/avatar_8.png',
    svg: '<img src="/images/avatars/avatar_8.png" alt="Cyborg Robot" class="w-full h-full object-cover rounded-full" />'
  },
  avatar_9: {
    id: 'avatar_9',
    name: 'Alien Marciano',
    gender: 'm',
    color: '#10b981',
    img: '/images/avatars/avatar_9.png',
    svg: '<img src="/images/avatars/avatar_9.png" alt="Alien Marciano" class="w-full h-full object-cover rounded-full" />'
  },
  avatar_10: {
    id: 'avatar_10',
    name: 'Gizmo',
    gender: 'm',
    color: '#ec4899',
    img: '/images/avatars/avatar_10.png',
    svg: '<img src="/images/avatars/avatar_10.png" alt="Gizmo" class="w-full h-full object-cover rounded-full" />'
  },
  avatar_11: {
    id: 'avatar_11',
    name: 'Comandante Espacial',
    gender: 'f',
    color: '#06b6d4',
    img: '/images/avatars/avatar_11.png',
    svg: '<img src="/images/avatars/avatar_11.png" alt="Comandante Espacial" class="w-full h-full object-cover rounded-full" />'
  },
  avatar_12: {
    id: 'avatar_12',
    name: 'Vigilante Encapuchado',
    gender: 'm',
    color: '#8b5cf6',
    img: '/images/avatars/avatar_12.png',
    svg: '<img src="/images/avatars/avatar_12.png" alt="Vigilante Encapuchado" class="w-full h-full object-cover rounded-full" />'
  },
  avatar_13: {
    id: 'avatar_13',
    name: 'Reina Cleopatra',
    gender: 'f',
    color: '#eab308',
    img: '/images/avatars/avatar_13.png',
    svg: '<img src="/images/avatars/avatar_13.png" alt="Reina Cleopatra" class="w-full h-full object-cover rounded-full" />'
  },
  avatar_14: {
    id: 'avatar_14',
    name: 'Capitán Pirata',
    gender: 'm',
    color: '#3b82f6',
    img: '/images/avatars/avatar_14.png',
    svg: '<img src="/images/avatars/avatar_14.png" alt="Capitán Pirata" class="w-full h-full object-cover rounded-full" />'
  },
  avatar_15: {
    id: 'avatar_15',
    name: 'Vampiresa',
    gender: 'f',
    color: '#f43f5e',
    img: '/images/avatars/avatar_15.png',
    svg: '<img src="/images/avatars/avatar_15.png" alt="Vampiresa" class="w-full h-full object-cover rounded-full" />'
  },
  avatar_16: {
    id: 'avatar_16',
    name: 'Astronauta',
    gender: 'm',
    color: '#38bdf8',
    img: '/images/avatars/avatar_16.png',
    svg: '<img src="/images/avatars/avatar_16.png" alt="Astronauta" class="w-full h-full object-cover rounded-full" />'
  }
};

// Mapeo no enumerable de retrocompatibilidad para perfiles previos guardados en localStorage o BD
const compatMap = {
  male_1: 'avatar_2',
  female_1: 'avatar_1',
  male_2: 'avatar_7',
  female_2: 'avatar_4',
  male_3: 'avatar_6',
  female_3: 'avatar_11',
  male_4: 'avatar_5',
  female_4: 'avatar_13'
};

for (const [oldKey, newKey] of Object.entries(compatMap)) {
  Object.defineProperty(AVATARS, oldKey, {
    value: AVATARS[newKey],
    enumerable: false,
    writable: true,
    configurable: true
  });
}

window.AVATARS = AVATARS;
