// src/lib/seoGenerator.ts

interface SeoPlaceholderData {
  cityName: string;
  areaName?: string;
  categoryName?: string;
  serviceName?: string;
  nearbyAreas?: Array<{ id: string; name: string; slug: string }>;
}

interface CoordsArea {
  id: string;
  name: string;
  slug: string;
  latitude?: number | string;
  longitude?: number | string;
}

export function getNearbyAreasSorted(
  selectedArea: { latitude?: number | string; longitude?: number | string } | null | undefined,
  allAreas: CoordsArea[],
  maxCount: number = 10
): Array<{ id: string; name: string; slug: string }> {
  if (!selectedArea) {
    return allAreas.slice(0, maxCount).map(a => ({ id: a.id, name: a.name, slug: a.slug }));
  }

  const lat1 = typeof selectedArea.latitude === 'string' ? parseFloat(selectedArea.latitude) : selectedArea.latitude;
  const lon1 = typeof selectedArea.longitude === 'string' ? parseFloat(selectedArea.longitude) : selectedArea.longitude;

  if (lat1 === undefined || lat1 === null || isNaN(lat1) || lon1 === undefined || lon1 === null || isNaN(lon1)) {
    return allAreas.slice(0, maxCount).map(a => ({ id: a.id, name: a.name, slug: a.slug }));
  }

  const areasWithDistance = allAreas
    .map(area => {
      const lat2 = typeof area.latitude === 'string' ? parseFloat(area.latitude) : area.latitude;
      const lon2 = typeof area.longitude === 'string' ? parseFloat(area.longitude) : area.longitude;

      if (lat2 === undefined || lat2 === null || isNaN(lat2) || lon2 === undefined || lon2 === null || isNaN(lon2)) {
        return { area, distance: Infinity };
      }

      const R = 6371; // Radius of Earth in km
      const dLat = (lat2 - lat1) * Math.PI / 180;
      const dLon = (lon2 - lon1) * Math.PI / 180;
      const aVal =
        Math.sin(dLat / 2) * Math.sin(dLat / 2) +
        Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
        Math.sin(dLon / 2) * Math.sin(dLon / 2);
      const c = 2 * Math.atan2(Math.sqrt(aVal), Math.sqrt(1 - aVal));
      const distance = R * c;

      return { area, distance };
    })
    .filter(item => item.distance !== Infinity && item.area.id !== (selectedArea as any).id)
    .sort((a, b) => a.distance - b.distance);

  return areasWithDistance.slice(0, maxCount).map(item => ({
    id: item.area.id,
    name: item.area.name,
    slug: item.area.slug
  }));
}

const getHash = (str: string): number => {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = str.charCodeAt(i) + ((hash << 5) - hash);
  }
  return Math.abs(hash);
};

const NEARBY_AREAS_MAP: Record<string, string[]> = {
  'byrathi': ['Hennur', 'Thanisandra', 'Horamavu', 'Kothanur', 'Geddalahalli', 'Kalyan Nagar', 'Kammanahalli', 'Babusapalya', 'Chikka Gubbi', 'Anagalapura'],
  'electronic-city': ['HSR Layout', 'Singasandra', 'Bommanahalli', 'Begur', 'Parappana Agrahara', 'Jayamahal', 'Kudlu Gate', 'Jigani', 'Chandapura', 'Huskur'],
  'hsr-layout': ['Koramangala', 'BTM Layout', 'Bellandur', 'Singasandra', 'Electronic City', 'Madiwala', 'Sarjapur Road', 'AECS Layout', 'Kudlu Gate', 'Bommanahalli'],
  'whitefield': ['Marathahalli', 'AECS Layout', 'Kadugodi', 'Hoodi', 'Varthur', 'Brookefield', 'Kundalahalli', 'Mahadevapura', 'Garudacharpalya', 'Nallurhalli'],
  'aecs-layout': ['Whitefield', 'Marathahalli', 'Brookefield', 'Kundalahalli', 'Varthur', 'Hoodi', 'Kadugodi', 'Mahadevapura', 'Doddanekundi', 'HAL'],
  'marathahalli': ['Whitefield', 'AECS Layout', 'Bellandur', 'HAL', 'Kadubeesanahalli', 'Brookefield', 'Kundalahalli', 'Doddanekundi', 'Yamalur', 'Munnekolala'],
  'indiranagar': ['Domlur', 'Ulsoor', 'CV Raman Nagar', 'Kalyan Nagar', 'HAL Road', 'Koramangala', 'Cox Town', 'Frazer Town', 'Benson Town', 'Jeevanbheemanagar']
};

export function getSpinnedLocalContent(data: SeoPlaceholderData & { templateIdx?: number }): string {
  const { cityName, areaName = '', categoryName = '', serviceName = '', nearbyAreas, templateIdx } = data;
  
  const idx = typeof templateIdx === 'number' ? templateIdx : Math.floor(Math.random() * 4);
  const targetLabel = serviceName || categoryName;
  const locationLabel = areaName || cityName;

  // Resolve nearby area list dynamically
  let nearbyList: string[] = [];
  if (nearbyAreas && nearbyAreas.length > 0) {
    nearbyList = nearbyAreas.map(a => a.name);
  } else {
    const cleanAreaKey = areaName.toLowerCase().replace(/[^a-z0-9]/g, '');
    nearbyList = NEARBY_AREAS_MAP[cleanAreaKey] || ['nearby neighborhoods', 'adjacent sectors', 'surrounding areas'];
  }
  
  const formattedAreas = nearbyList.slice(0, 10).join(', ');

  // 1. Subheadlines
  const subheadlines = [
    `${targetLabel} Services in ${locationLabel}, ${cityName}`,
    `Professional ${targetLabel} Solutions Across ${locationLabel}`,
    `On-Demand ${targetLabel} in ${locationLabel} | Verified Technicians`,
    `Premium Doorstep ${targetLabel} in ${locationLabel} near you`
  ];

  // 2. Main Paragraphs (Part 1)
  const paragraph1List = [
    `Need professional ${targetLabel} services in ${locationLabel}? Yourbrand connects customers with trusted local experts who provide reliable service solutions for homes, apartments, offices, retail shops, and commercial properties throughout ${locationLabel} and neighbouring areas like ${formattedAreas}.`,
    `Looking for certified ${targetLabel} specialists near you in ${locationLabel}? Yourbrand brings you background-verified trade experts equipped with advanced tools to handle home maintenance, retail support, and corporate installations around ${locationLabel} and neighbouring localities like ${formattedAreas}.`,
    `If you are searching for high-quality ${targetLabel} in ${locationLabel}, our digital booking platform offers instant scheduling. Yourbrand connects you with skilled pros serving residential complexes, offices, and retail properties in ${locationLabel} as well as adjacent sectors including ${formattedAreas}.`,
    `Get verified doorstep assistance for ${targetLabel} in ${locationLabel}. Yourbrand bridges the gap between home-owners and certified service professionals, delivering premium quality solutions across the entire ${locationLabel} region and surrounding areas like ${formattedAreas}.`
  ];

  const paragraph2List = [
    `Our local professionals understand the service requirements of customers in ${locationLabel} and provide prompt assistance, quality workmanship, and convenient scheduling options. From small repairs to complete installations and maintenance projects, we help ensure every job is completed efficiently.`,
    `Every trade expert in ${locationLabel} is vetted for quality and safety. We understand that your time is valuable, which is why we offer flexible booking slots, same-day emergency options, and fixed upfront rates with zero hidden charges.`,
    `Our dedicated service crews in ${locationLabel} deliver standard-setting workmanship using premium grade materials. Whether it is a minor fix or an extensive remodel, our team ensures complete reliability and a post-service cleanup.`,
    `With thousands of successfully completed service calls in ${locationLabel}, we focus on customer satisfaction above all else. Benefit from quick turnaround times, friendly customer support, and warranty coverage on all repairs.`
  ];

  // 3. Highlight Cards (3 items per list)
  const highlightCards = [
    [
      { title: "Local Experts", subtitle: `Professionals serving ${locationLabel} and nearby locations like ${nearbyList.slice(0, 3).join(', ')}.` },
      { title: "Fast Response", subtitle: "Quick service scheduling and local availability." },
      { title: "Trusted Service", subtitle: "Reliable workmanship and customer-focused support." }
    ],
    [
      { title: "Certified Vetted Pros", subtitle: `Highly skilled specialists operating in ${locationLabel} and ${nearbyList.slice(0, 3).join(', ')}.` },
      { title: "Upfront Fixed Pricing", subtitle: "Clear transparent invoices with zero hidden charges." },
      { title: "Satisfaction Guaranteed", subtitle: "Enjoy comprehensive warranties and friendly after-service support." }
    ],
    [
      { title: "Experienced Techs", subtitle: `Background-verified trade professionals covering ${locationLabel} and ${nearbyList.slice(0, 3).join(', ')}.` },
      { title: "Same-Day Bookings", subtitle: "Flexible time slots suited to your busy calendar." },
      { title: "Standard Quality Tools", subtitle: "We use only premium materials and modern tools for repair work." }
    ],
    [
      { title: "Doorstep Assistance", subtitle: `Prompt local technicians serving ${locationLabel} and surrounding sectors like ${nearbyList.slice(0, 3).join(', ')}.` },
      { title: "Online Confirmations", subtitle: "Instant booking verification and live status notifications." },
      { title: "Clean & Professional", subtitle: "Our crews maintain neatness and follow post-service cleaning protocols." }
    ]
  ];

  // 4. Benefits Section (6 items per list)
  const benefitsLists = [
    [
      `Dedicated local service professionals in ${locationLabel}`,
      `Faster arrival and response times across ${locationLabel}`,
      `Flexible appointment scheduling for your convenience`,
      `Residential and commercial support in ${locationLabel}`,
      `Professional tools and equipment for precise execution`,
      `Reliable service quality standards and warranty`
    ],
    [
      `Fully vetted and background-checked technicians`,
      `Prompt doorstep response in ${locationLabel} and surrounding sectors`,
      `Upfront estimates with zero hidden billing items`,
      `Comprehensive warranty coverage on all parts and labor`,
      `Certified experts specializing in standard home installations`,
      `Emergency booking slots for same-day repair needs`
    ],
    [
      `Skilled trade workers stationed locally in ${locationLabel}`,
      `Quick transit times to ${nearbyList.slice(0, 3).join(', ')}`,
      `Transparent fixed billing with online invoices`,
      `Flexible timing tailored to fit your busy schedule`,
      `Use of premium-grade replacement parts and materials`,
      `100% customer satisfaction guarantee on all service calls`
    ],
    [
      `Friendly customer care and after-service assistance`,
      `Technicians equipped with state-of-the-art tools`,
      `Doorstep service covering homes, shops, and offices in ${locationLabel}`,
      `Clean-up protocols followed after every job completion`,
      `Affordable local rates with online booking discounts`,
      `Certified specialists with decades of cumulative trade experience`
    ]
  ];

  // 5. Serving Customers (Part 2)
  const paragraph3List = [
    `We help customers in apartments, independent houses, villas, gated communities, office spaces, retail outlets, and commercial buildings throughout ${locationLabel} with dependable ${targetLabel} services.`,
    `Our network covers independent homes, high-rise apartments, retail shops, business centers, corporate offices, and gated communities throughout ${locationLabel}.`,
    `We extend our services to residential complexes, villa associations, corporate hubs, showrooms, and retail stores situated in ${locationLabel} and neighbouring sectors.`,
    `Whether you live in a gated community, manage a corporate office space, or run a retail showroom in ${locationLabel}, our technicians are ready to assist you.`
  ];

  const paragraph4List = [
    `If you are searching for trusted ${targetLabel} near ${locationLabel}, ${cityName}, Yourbrand helps you connect with experienced professionals for quality service and dependable support.`,
    `For anyone seeking reliable ${targetLabel} near me in ${locationLabel}, our certified technicians provide fast, professional, and friendly assistance.`,
    `Get connected to the best ${targetLabel} near you in ${locationLabel} today. Experience standard-setting doorstep maintenance with Yourbrand.`,
    `Searching for affordable ${targetLabel} near you in ${locationLabel}? Look no further. Yourbrand guarantees high-quality repairs with maximum convenience.`
  ];

  const selectedSubheadline = subheadlines[idx];
  const selectedP1 = paragraph1List[idx];
  const selectedP2 = paragraph2List[idx];
  const selectedCards = highlightCards[idx];
  const selectedBenefits = benefitsLists[idx];
  const selectedP3 = paragraph3List[idx];
  const selectedP4 = paragraph4List[idx];

  return `
<div class="space-y-8 text-slate-700">
  <!-- Subheadline -->
  <p class="text-md font-semibold text-slate-500 tracking-wide uppercase">${selectedSubheadline}</p>

  <!-- Paragraphs -->
  <div class="space-y-4">
    <p class="leading-relaxed text-slate-600">${selectedP1}</p>
    <p class="leading-relaxed text-slate-600">${selectedP2}</p>
  </div>

  <!-- Highlight Cards -->
  <div class="grid grid-cols-1 md:grid-cols-3 gap-4 bg-slate-50 p-6 rounded-2xl border border-slate-100">
    ${selectedCards.map(card => `
      <div class="space-y-2">
        <h4 class="font-bold text-slate-900 text-base">${card.title}</h4>
        <p class="text-sm text-slate-500 leading-relaxed">${card.subtitle}</p>
      </div>
    `).join('')}
  </div>

  <!-- Benefits Section -->
  <div class="space-y-4">
    <h3 class="text-lg font-bold text-slate-900">Benefits of Booking in ${locationLabel}</h3>
    <ul class="grid grid-cols-1 md:grid-cols-2 gap-2 list-none pl-0">
      ${selectedBenefits.map(benefit => `
        <li class="flex items-center text-sm text-slate-600">
          <span class="text-green-500 mr-2 font-bold">✓</span>
          ${benefit}
        </li>
      `).join('')}
    </ul>
  </div>

  <!-- Serving Section -->
  <div class="space-y-4 pt-4 border-t border-slate-100">
    <h3 class="text-lg font-bold text-slate-900">Serving Customers Across ${locationLabel}</h3>
    <p class="leading-relaxed text-slate-600">${selectedP3}</p>
    <p class="leading-relaxed text-slate-600">${selectedP4}</p>
  </div>
</div>
  `.trim();
}

export function generateFreeCitySeoData(cityName: string, categoryNames: string[], nearbyAreas?: Array<{ id: string; name: string; slug: string }>) {
  const idx = Math.floor(Math.random() * 4);
  const topCats = categoryNames.slice(0, 5);
  const catsText = topCats.length > 0 ? topCats.join(', ') : "Plumbing, Electrical, Carpentry";

  const areaList = nearbyAreas ? nearbyAreas.map(a => a.name) : [];
  const formattedAreas = areaList.slice(0, 10).join(', ');
  const localCoverageText = formattedAreas ? ` covering areas like ${formattedAreas}` : '';

  const h1Templates = [
    `Home Services in ${cityName}`,
    `Home Services & Repair in ${cityName}`,
    `Home Maintenance Services in ${cityName}`,
    `Handyman & Home Services in ${cityName}`
  ];

  const titleTemplates = [
    `Trusted Home Services in ${cityName} | Verified Local Experts`,
    `Best Home Repair & Maintenance Services in ${cityName} Near Me`,
    `Premium Home Services & Local Technicians in ${cityName}`,
    `Doorstep Home Repair & Handyman Services in ${cityName} Near You`
  ];

  const descTemplates = [
    `Looking for trusted home services in ${cityName} near you? Yourbrand connects you with certified experts for ${catsText}${localCoverageText}. Book online with upfront pricing!`,
    `Need professional repair in ${cityName} near me? Find background-verified pros for ${catsText}${localCoverageText}. Scheduled convenience, zero hidden fees.`,
    `Get premium home maintenance in ${cityName} today. Our local handymen offer same-day service for ${catsText}${localCoverageText} with friendly assistance. Book your slot now!`,
    `Yourbrand offers high-quality home repair in ${cityName} near you. Book verified experts for ${catsText}${localCoverageText} with upfront rates and guaranteed support.`
  ];

  const keywordsList: string[] = [
    `home services ${cityName}`,
    `home maintenance ${cityName}`,
    `${cityName} home repair near me`
  ];

  categoryNames.forEach(cat => {
    const cleanCat = cat.toLowerCase();
    keywordsList.push(`${cleanCat} in ${cityName} near me`);
    keywordsList.push(`${cleanCat} services ${cityName}`);
    keywordsList.push(`best ${cleanCat} in ${cityName} near you`);
  });

  areaList.slice(0, 10).forEach(area => {
    keywordsList.push(`home services in ${area}`);
    keywordsList.push(`handyman in ${area} near me`);
  });

  const generic = [
    `local handymen ${cityName}`, `booking services in ${cityName}`,
    `home maintenance services ${cityName}`, `certified repair ${cityName}`, `home services near you`,
    `yourbrand ${cityName}`, `booking app ${cityName}`, `professional service ${cityName}`,
    `home care ${cityName}`, `local experts ${cityName}`, `repair technicians ${cityName}`,
    `handymen near me`, `repair near me`
  ];

  while (keywordsList.length < 25 && generic.length > 0) {
    const gen = generic.shift();
    if (gen && !keywordsList.includes(gen)) keywordsList.push(gen);
  }

  return {
    h1_title: h1Templates[idx],
    seo_title: titleTemplates[idx],
    seo_description: descTemplates[idx],
    seo_keywords: keywordsList.slice(0, 25).join(', ')
  };
}

export function generateFreeAreaSeoData(cityName: string, areaName: string, categoryNames: string[], nearbyAreas?: Array<{ id: string; name: string; slug: string }>) {
  const idx = Math.floor(Math.random() * 4);
  const topCats = categoryNames.slice(0, 5);
  const catsText = topCats.length > 0 ? topCats.join(', ') : "Plumbing, Electrical, Carpentry";

  const areaList = nearbyAreas ? nearbyAreas.map(a => a.name) : [];
  const formattedAreas = areaList.slice(0, 10).join(', ');
  const localCoverageText = formattedAreas ? ` and surrounding sectors like ${formattedAreas}` : '';

  const h1Templates = [
    `Home Services in ${areaName}`,
    `Home Services & Repair in ${areaName}`,
    `Home Maintenance Services in ${areaName}`,
    `Handyman & Home Services in ${areaName}`
  ];

  const titleTemplates = [
    `Trusted Home Services in ${areaName}, ${cityName} | Verified Local Experts`,
    `Best Home Repair & Maintenance in ${areaName} Near Me`,
    `Premium Home Services & Local Technicians in ${areaName} near ${cityName}`,
    `Doorstep Home Repair & Handyman Services in ${areaName} Near You`
  ];

  const descTemplates = [
    `Looking for trusted home services in ${areaName}, ${cityName} near you? Yourbrand connects you with certified experts for ${catsText}${localCoverageText}. Book online with upfront pricing!`,
    `Need professional repair in ${areaName} near me? Find background-verified pros for ${catsText}${localCoverageText} near ${cityName}. Scheduled convenience, zero hidden fees.`,
    `Get premium home maintenance in ${areaName} today. Our local handymen offer same-day service for ${catsText}${localCoverageText} with friendly assistance. Book your slot now!`,
    `Yourbrand offers high-quality home repair in ${areaName} near you. Book verified experts for ${catsText}${localCoverageText} with upfront rates and guaranteed support.`
  ];

  const keywordsList: string[] = [
    `home services ${areaName}`,
    `home maintenance ${areaName}`,
    `${areaName} home repair near me`
  ];

  categoryNames.forEach(cat => {
    const cleanCat = cat.toLowerCase();
    keywordsList.push(`${cleanCat} in ${areaName} near me`);
    keywordsList.push(`${cleanCat} services ${areaName}`);
    keywordsList.push(`best ${cleanCat} in ${areaName} ${cityName}`);
  });

  areaList.slice(0, 10).forEach(na => {
    keywordsList.push(`home services in ${na} near me`);
    keywordsList.push(`handyman in ${na} near you`);
  });

  const generic = [
    `local handymen ${areaName}`, `booking services in ${areaName}`,
    `home maintenance services ${areaName}`, `certified repair ${areaName}`, `home services near you`,
    `yourbrand ${areaName}`, `booking app ${areaName}`, `professional service ${areaName}`,
    `home care ${areaName}`, `local experts ${areaName}`, `repair technicians ${areaName}`,
    `handymen near me ${areaName}`, `repair near me ${areaName}`
  ];

  while (keywordsList.length < 25 && generic.length > 0) {
    const gen = generic.shift();
    if (gen && !keywordsList.includes(gen)) keywordsList.push(gen);
  }

  return {
    h1_title: h1Templates[idx],
    seo_title: titleTemplates[idx],
    seo_description: descTemplates[idx],
    seo_keywords: keywordsList.slice(0, 25).join(', ')
  };
}

export function generateFreeCityCategorySeoData(cityName: string, categoryName: string, serviceNames: string[], nearbyAreas?: Array<{ id: string; name: string; slug: string }>) {
  const idx = Math.floor(Math.random() * 4);
  const topServices = serviceNames.slice(0, 5);
  const servicesText = topServices.length > 0 ? topServices.join(', ') : `${categoryName} repair, ${categoryName} installation`;

  const areaList = nearbyAreas ? nearbyAreas.map(a => a.name) : [];
  const formattedAreas = areaList.slice(0, 10).join(', ');
  const localCoverageText = formattedAreas ? ` covering areas like ${formattedAreas}` : '';

  const h1Templates = [
    `${categoryName} Services in ${cityName}`,
    `${categoryName} & Repair in ${cityName}`,
    `Professional ${categoryName} in ${cityName}`,
    `Doorstep ${categoryName} Services in ${cityName}`
  ];

  const titleTemplates = [
    `Trusted ${categoryName} Services in ${cityName} | Verified Local Experts`,
    `Best ${categoryName} Repair & Maintenance in ${cityName} Near Me`,
    `Premium ${categoryName} Services & Local Technicians in ${cityName}`,
    `Doorstep ${categoryName} Services in ${cityName} Near You | Yourbrand`
  ];

  const descTemplates = [
    `Looking for trusted ${categoryName.toLowerCase()} services in ${cityName} near you? Yourbrand connects you with certified experts for ${servicesText}${localCoverageText}. Book online with upfront pricing!`,
    `Need professional ${categoryName.toLowerCase()} repair in ${cityName} near me? Find background-verified pros for ${servicesText}${localCoverageText}. Scheduled convenience, zero hidden fees.`,
    `Get premium ${categoryName.toLowerCase()} maintenance in ${cityName} today. Our local technicians offer same-day service for ${servicesText}${localCoverageText} with friendly assistance.`,
    `Yourbrand offers top-quality ${categoryName.toLowerCase()} services in ${cityName} near you. Book verified specialists for ${servicesText}${localCoverageText} with upfront rates.`
  ];

  const cleanCat = categoryName.toLowerCase();
  const keywordsList: string[] = [
    `${cleanCat} ${cityName}`,
    `${cleanCat} services ${cityName}`,
    `${cityName} ${cleanCat} near me`,
    `best ${cleanCat} in ${cityName} near me`
  ];

  serviceNames.forEach(srv => {
    const cleanSrv = srv.toLowerCase();
    keywordsList.push(`${cleanSrv} in ${cityName} near me`);
    keywordsList.push(`${cleanSrv} services ${cityName}`);
    keywordsList.push(`best ${cleanSrv} in ${cityName} near you`);
  });

  areaList.slice(0, 10).forEach(area => {
    keywordsList.push(`${cleanCat} in ${area} near me`);
    keywordsList.push(`${cleanCat} services ${area}`);
  });

  const generic = [
    `local ${cleanCat} ${cityName}`, `booking ${cleanCat} in ${cityName}`,
    `professional ${cleanCat} in ${cityName} near me`, `certified ${cleanCat} in ${cityName} near me`, `${cleanCat} cleaning ${cityName} near you`,
    `${cleanCat} repair ${cityName}`, `certified ${cleanCat} ${cityName}`, `${cleanCat} near you`,
    `yourbrand ${cleanCat} ${cityName}`, `booking app ${cleanCat} ${cityName}`, `professional ${cleanCat} service ${cityName}`,
    `${cleanCat} care ${cityName}`, `local ${cleanCat} experts ${cityName}`, `repair technicians ${cleanCat} ${cityName}`,
    `${cleanCat} near me`, `repair near me`
  ];

  while (keywordsList.length < 25 && generic.length > 0) {
    const gen = generic.shift();
    if (gen && !keywordsList.includes(gen)) keywordsList.push(gen);
  }

  const spinnedContent = getSpinnedLocalContent({
    cityName,
    categoryName,
    nearbyAreas,
    templateIdx: idx
  });

  const faqsList = [
    {
      question: `Do you provide ${categoryName.toLowerCase()} services in ${cityName}?`,
      answer: `Yes, Yourbrand provides comprehensive, top-rated ${categoryName.toLowerCase()} services throughout ${cityName} and surrounding localities.`
    },
    {
      question: `How quickly can I book a professional ${categoryName.toLowerCase()} in ${cityName}?`,
      answer: `You can schedule an appointment online instantly. We offer flexible time slots and same-day services in most parts of ${cityName} including ${formattedAreas}.`
    }
  ];

  return {
    h1_title: h1Templates[idx],
    seo_title: titleTemplates[idx],
    seo_description: descTemplates[idx],
    seo_keywords: keywordsList.slice(0, 25).join(', '),
    seo_content: spinnedContent,
    faqs: faqsList,
    imageHint: `${categoryName.toLowerCase()} ${cityName.toLowerCase()}`
  };
}

export function generateFreeAreaCategorySeoData(cityName: string, areaName: string, categoryName: string, serviceNames: string[], nearbyAreas?: Array<{ id: string; name: string; slug: string }>) {
  const idx = Math.floor(Math.random() * 4);
  const topServices = serviceNames.slice(0, 5);
  const servicesText = topServices.length > 0 ? topServices.join(', ') : `${categoryName} repair, ${categoryName} installation`;

  let nearbyList: string[] = [];
  if (nearbyAreas && nearbyAreas.length > 0) {
    nearbyList = nearbyAreas.map(a => a.name);
  } else {
    const cleanAreaKey = areaName.toLowerCase().replace(/[^a-z0-9]/g, '');
    nearbyList = NEARBY_AREAS_MAP[cleanAreaKey] || ['nearby neighborhoods', 'adjacent sectors', 'surrounding areas'];
  }
  
  const formattedAreas = nearbyList.slice(0, 10).join(', ');

  const h1Templates = [
    `${categoryName} Services in ${areaName}`,
    `${categoryName} & Repair in ${areaName}`,
    `Professional ${categoryName} in ${areaName}`,
    `Doorstep ${categoryName} Services in ${areaName}`
  ];

  const titleTemplates = [
    `Trusted ${categoryName} Services in ${areaName}, ${cityName} | Verified Local Experts`,
    `Best ${categoryName} Repair & Maintenance in ${areaName} Near Me`,
    `Premium ${categoryName} Services & Local Technicians in ${areaName} near ${cityName}`,
    `Doorstep ${categoryName} Services in ${areaName} Near You | Yourbrand`
  ];

  const descTemplates = [
    `Looking for trusted ${categoryName.toLowerCase()} services in ${areaName}, ${cityName} near you? Yourbrand connects you with certified experts for ${servicesText}. Book online with upfront pricing!`,
    `Need professional ${categoryName.toLowerCase()} repair in ${areaName} near me? Find background-verified pros for ${servicesText} near ${cityName}. Scheduled convenience, zero hidden fees.`,
    `Get premium ${categoryName.toLowerCase()} maintenance in ${areaName} today. Our local technicians offer same-day service for ${servicesText} with friendly assistance.`,
    `Yourbrand offers top-quality ${categoryName.toLowerCase()} services in ${areaName} near you. Book verified specialists for ${servicesText} covering ${nearbyList.slice(0, 3).join(', ')}.`
  ];

  const cleanCat = categoryName.toLowerCase();
  const keywordsList: string[] = [
    `${cleanCat} ${areaName}`,
    `${cleanCat} services ${areaName}`,
    `${areaName} ${cleanCat} near me`,
    `best ${cleanCat} in ${areaName} near me`
  ];

  serviceNames.forEach(srv => {
    const cleanSrv = srv.toLowerCase();
    keywordsList.push(`${cleanSrv} in ${areaName} near me`);
    keywordsList.push(`${cleanSrv} services ${areaName}`);
    keywordsList.push(`best ${cleanSrv} in ${areaName} ${cityName}`);
  });

  nearbyList.slice(0, 10).forEach(na => {
    keywordsList.push(`${cleanCat} in ${na} near me`);
    keywordsList.push(`${cleanCat} services ${na}`);
  });

  const generic = [
    `local ${cleanCat} ${areaName}`, `booking ${cleanCat} in ${areaName}`,
    `professional ${cleanCat} in ${areaName} near me`, `certified ${cleanCat} in ${areaName} near me`, `${cleanCat} cleaning ${areaName} near you`,
    `${cleanCat} repair ${areaName}`, `certified ${cleanCat} ${areaName}`, `${cleanCat} near you`,
    `yourbrand ${cleanCat} ${areaName}`, `booking app ${cleanCat} ${areaName}`, `professional ${cleanCat} service ${areaName}`,
    `${cleanCat} care ${areaName}`, `local ${cleanCat} experts ${areaName}`, `repair technicians ${cleanCat} ${areaName}`,
    `${cleanCat} near me ${areaName}`, `repair near me ${areaName}`
  ];

  while (keywordsList.length < 25 && generic.length > 0) {
    const gen = generic.shift();
    if (gen && !keywordsList.includes(gen)) keywordsList.push(gen);
  }

  const spinnedContent = getSpinnedLocalContent({
    cityName,
    areaName,
    categoryName,
    nearbyAreas,
    templateIdx: idx
  });

  const faqsList = [
    {
      question: `Do you provide ${categoryName.toLowerCase()} services in ${areaName}?`,
      answer: `Yes, Yourbrand provides comprehensive, top-rated ${categoryName.toLowerCase()} services throughout ${areaName} and surrounding areas like ${formattedAreas}.`
    },
    {
      question: `How quickly can I book a professional ${categoryName.toLowerCase()} in ${areaName}?`,
      answer: `You can schedule an appointment online instantly. We offer flexible time slots and same-day services in most parts of ${areaName} and nearby ${formattedAreas}.`
    }
  ];

  return {
    h1_title: h1Templates[idx],
    seo_title: titleTemplates[idx],
    seo_description: descTemplates[idx],
    seo_keywords: keywordsList.slice(0, 25).join(', '),
    seo_content: spinnedContent,
    faqs: faqsList,
    imageHint: `${categoryName.toLowerCase()} ${areaName.toLowerCase()}`
  };
}

export function generateFreeAreaServiceSeoData(cityName: string, areaName: string, categoryName: string, serviceName: string, nearbyAreas?: Array<{ id: string; name: string; slug: string }>) {
  const idx = Math.floor(Math.random() * 4);

  let nearbyList: string[] = [];
  if (nearbyAreas && nearbyAreas.length > 0) {
    nearbyList = nearbyAreas.map(a => a.name);
  } else {
    const cleanAreaKey = areaName.toLowerCase().replace(/[^a-z0-9]/g, '');
    nearbyList = NEARBY_AREAS_MAP[cleanAreaKey] || ['nearby neighborhoods', 'adjacent sectors', 'surrounding areas'];
  }

  const formattedAreas = nearbyList.slice(0, 10).join(', ');

  const h1Templates = [
    `${serviceName} in ${areaName}`,
    `${serviceName} Services in ${areaName}`,
    `Professional ${serviceName} in ${areaName}`,
    `Doorstep ${serviceName} in ${areaName}`
  ];

  const titleTemplates = [
    `Trusted ${serviceName} in ${areaName}, ${cityName} | Verified Local Experts`,
    `Best ${serviceName} Repair & Maintenance in ${areaName} Near Me`,
    `Premium ${serviceName} & Local Technicians in ${areaName} near ${cityName}`,
    `Doorstep ${serviceName} Services in ${areaName} Near You | Yourbrand`
  ];

  const descTemplates = [
    `Looking for trusted ${serviceName.toLowerCase()} in ${areaName}, ${cityName} near you? Yourbrand connects you with certified experts. Book online with upfront pricing!`,
    `Need professional ${serviceName.toLowerCase()} in ${areaName} near me? Find background-verified pros near ${cityName}. Scheduled convenience, zero hidden fees.`,
    `Get premium ${serviceName.toLowerCase()} in ${areaName} today. Our local technicians offer same-day service with friendly assistance.`,
    `Yourbrand offers top-quality ${serviceName.toLowerCase()} services in ${areaName} near you. Book verified specialists covering ${nearbyList.slice(0, 3).join(', ')}.`
  ];

  const cleanSrv = serviceName.toLowerCase();
  const cleanCat = categoryName.toLowerCase();
  const keywordsList: string[] = [
    `${cleanSrv} ${areaName}`,
    `${cleanSrv} services ${areaName}`,
    `${areaName} ${cleanSrv} near me`,
    `best ${cleanSrv} in ${areaName} near me`
  ];

  keywordsList.push(`${cleanSrv} in ${areaName} ${cityName}`);
  keywordsList.push(`${cleanCat} services in ${areaName}`);
  keywordsList.push(`best ${cleanCat} in ${areaName} near me`);
  
  nearbyList.slice(0, 10).forEach(na => {
    keywordsList.push(`${cleanSrv} in ${na} near me`);
    keywordsList.push(`${cleanSrv} services ${na}`);
  });

  const generic = [
    `local ${cleanSrv} ${areaName}`, `booking ${cleanSrv} in ${areaName}`,
    `professional ${cleanSrv} in ${areaName} near me`, `certified ${cleanSrv} in ${areaName} near me`, `${cleanSrv} cleaning ${areaName} near you`,
    `${cleanSrv} repair ${areaName}`, `certified ${cleanSrv} ${areaName}`, `${cleanSrv} near you`,
    `yourbrand ${cleanSrv} ${areaName}`, `booking app ${cleanSrv} ${areaName}`, `professional ${cleanSrv} service ${areaName}`,
    `${cleanSrv} care ${areaName}`, `local ${cleanSrv} experts ${areaName}`, `repair technicians ${cleanSrv} ${areaName}`,
    `${cleanSrv} near me ${areaName}`, `repair near me ${areaName}`
  ];

  while (keywordsList.length < 25 && generic.length > 0) {
    const gen = generic.shift();
    if (gen && !keywordsList.includes(gen)) keywordsList.push(gen);
  }

  const spinnedContent = getSpinnedLocalContent({
    cityName,
    areaName,
    serviceName,
    nearbyAreas,
    templateIdx: idx
  });

  const faqsList = [
    {
      question: `Do you provide ${serviceName.toLowerCase()} in ${areaName}?`,
      answer: `Yes, Yourbrand provides comprehensive, top-rated ${serviceName.toLowerCase()} throughout ${areaName} and surrounding areas like ${formattedAreas}.`
    },
    {
      question: `How quickly can I book a professional for ${serviceName.toLowerCase()} in ${areaName}?`,
      answer: `You can schedule an appointment online instantly. We offer flexible time slots and same-day services in most parts of ${areaName} and nearby ${formattedAreas}.`
    }
  ];

  return {
    h1_title: h1Templates[idx],
    seo_title: titleTemplates[idx],
    seo_description: descTemplates[idx],
    seo_keywords: keywordsList.slice(0, 25).join(', '),
    seo_content: spinnedContent,
    faqs: faqsList,
    imageHint: `${serviceName.toLowerCase()} ${areaName.toLowerCase()}`
  };
}
