/** Neighbourhoods per emirate for the public Live stores directory. A starting set: owners can also type their own ("Other"). */
export const OTHER_AREA = "Other";

export const AREAS: Record<string, string[]> = {
  Dubai: ["Al Barsha", "Al Karama", "Al Qusais", "Al Quoz", "Bur Dubai", "Business Bay", "Deira", "Downtown Dubai", "Dubai Marina", "Dubai Silicon Oasis", "International City", "Jebel Ali", "JLT", "Jumeirah", "Mirdif", "Muhaisnah", "Al Nahda", "Oud Metha", "Satwa", "Sheikh Zayed Road", "Ras Al Khor", "Warqa"],
  "Abu Dhabi": ["Al Reem Island", "Al Wahda", "Electra Street", "Hamdan Street", "Khalidiyah", "Khalifa City", "Mussafah", "Mohammed Bin Zayed City", "Corniche", "Yas Island"],
  Sharjah: ["Al Majaz", "Al Nahda", "Al Qasimia", "Al Taawun", "Industrial Area", "Muweilah", "Rolla", "University City"],
  Ajman: ["Al Nuaimiya", "Al Rashidiya", "Industrial Area", "Jurf", "Ajman City Centre"],
  "Ras Al Khaimah": ["Al Nakheel", "Al Hamra", "Julphar", "Old Ras Al Khaimah", "Al Dhait"],
  Fujairah: ["Fujairah City", "Dibba", "Al Faseel"],
  "Umm Al Quwain": ["Umm Al Quwain City", "Al Salama", "Falaj Al Mualla"],
};

export const areasFor = (emirate: string): string[] => AREAS[emirate] ?? [];
