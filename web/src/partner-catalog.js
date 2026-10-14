// Keep unreleased partners as drafts. Only published entries appear in the lounge.
export const partnerCatalog = [
  { id: 'feelingfine', name: '필링파인', image: '/assets/feelingfine-bar-hero.jpg', published: false },
];

export const publishedMemberPartners = partnerCatalog.filter(partner => partner.published);
