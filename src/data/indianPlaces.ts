export interface PlaceData {
  districts: {
    [districtName: string]: {
      taluks: {
        [talukName: string]: string[]; // array of cities/villages
      };
    };
  };
}

export const INDIAN_GEOGRAPHY: { [stateName: string]: PlaceData } = {
  "Karnataka": {
    districts: {
      "Bengaluru Urban": {
        taluks: {
          "Bengaluru North": ["Yeswanthpur", "Yelahanka", "Hebbal", "Jalahalli", "Peenya"],
          "Bengaluru South": ["Kengeri", "Uttarahalli", "Begur", "Banashankari", "Jayanagar"],
          "Bengaluru East": ["K.R. Puram", "Mahadevapura", "Whitefield", "Marathahalli", "Varthur"],
          "Anekal": ["Anekal Town", "Sarjapura", "Attibele", "Jigani", "Chandapura"]
        }
      },
      "Bengaluru Rural": {
        taluks: {
          "Devanahalli": ["Devanahalli Town", "Vijayapura", "Budigere", "Channarayapatna"],
          "Doddaballapura": ["Doddaballapura Town", "Tubagere", "Sasalu", "Doddabelavangala"],
          "Hosakote": ["Hosakote Town", "Sulaiya", "Anugondanahalli", "Jadigenahalli"],
          "Nelamangala": ["Nelamangala Town", "Tyamagondlu", "Sompura", "Dasanapura"]
        }
      },
      "Mysuru": {
        taluks: {
          "Mysuru": ["Gokulam", "Vidyaranyapuram", "Ramakrishnanagar", "Chamundi Hill", "Alanahalli"],
          "Nanjangud": ["Nanjangud Town", "Hullahalli", "Hadinaru", "Debur", "Kavalande"],
          "T. Narasipura": ["T. Narasipura Town", "Bannur", "Mugur", "Sosale", "Talakadu"],
          "Hunsur": ["Hunsur Town", "Bililkele", "Hampapura", "Gavinahalli"]
        }
      },
      "Mandya": {
        taluks: {
          "Mandya": ["Mandya City", "Keregodu", "Basaralu", "Holalu"],
          "Maddur": ["Maddur Town", "Koppa", "Besagarahalli", "Athagur"],
          "Srirangapatna": ["Srirangapatna Town", "Arakere", "K. Shettihalli", "Palahalli"],
          "Malavalli": ["Malavalli Town", "Halagur", "Kirugavalu", "Boppagowdanapura"]
        }
      }
    }
  },
  "Maharashtra": {
    districts: {
      "Mumbai City": {
        taluks: {
          "Colaba": ["Fort", "Nariman Point", "Cuffe Parade", "Colaba Market"],
          "Dharavi": ["Sion West", "Shahu Nagar", "Kala Killa"],
          "Worli": ["Worli Sea Face", "Prabhadevi", "Lower Parel"]
        }
      },
      "Pune": {
        taluks: {
          "Haveli": ["Pune Cantonment", "Hadapsar", "Kondhwa", "Kothrud"],
          "Baramati": ["Baramati Town", "Malegaon", "Morgaon", "Someshwar"],
          "Maval": ["Lonavala", "Khandala", "Talegaon Dabhade", "Vadgaon"],
          "Shirur": ["Shirur Town", "Ranjangaon", "Chakan", "Shikrapur"]
        }
      },
      "Nagpur": {
        taluks: {
          "Nagpur Rural": ["Wadi", "Kamptee", "Kanhan", "Butibori"],
          "Ramtek": ["Ramtek Town", "Khindsi", "Deolapar", "Mansar"]
        }
      }
    }
  },
  "Tamil Nadu": {
    districts: {
      "Chennai": {
        taluks: {
          "Mylapore": ["Mandaveli", "San Thome", "R.A. Puram", "Alwarpet"],
          "Guindy": ["Adyar", "Velachery", "Saidapet", "Thiruvanmiyur"],
          "Ambattur": ["Ambattur OT", "Padi", "Mogappair", "Anna Nagar West"]
        }
      },
      "Coimbatore": {
        taluks: {
          "Coimbatore North": ["Ganapathy", "Thudiyalur", "Kavundampalayam", "Saravanampatti"],
          "Coimbatore South": ["Ramanathapuram", "Singanallur", "Peelamedu", "Udayampalayam"],
          "Pollachi": ["Pollachi Town", "Samathur", "Zamin Uthukuli", "Anaimalai"]
        }
      }
    }
  },
  "Andhra Pradesh": {
    districts: {
      "Visakhapatnam": {
        taluks: {
          "Visakhapatnam Urban": ["Maharani Peta", "Gajuwaka", "Madhurawada", "MVP Colony"],
          "Anakapalle": ["Anakapalle Town", "Munagapaka", "Kasimkota"]
        }
      },
      "NTR (Vijayawada)": {
        taluks: {
          "Vijayawada Urban": ["Benz Circle", "Governorpet", "Satyanarayanapuram", "Patamata"],
          "Ibrahimpatnam": ["Kondapalli", "Ibrahimpatnam Town", "Ferry"]
        }
      }
    }
  },
  "Telangana": {
    districts: {
      "Hyderabad": {
        taluks: {
          "Secunderabad": ["Begumpet", "Maredpally", "Chilkalguda", "Sindhi Colony"],
          "Charminar": ["Falaknuma", "Moghalpura", "Laad Bazaar", "Bahadurpura"],
          "Khairatabad": ["Banjara Hills", "Jubilee Hills", "Somajiguda", "Ameerpet"]
        }
      }
    }
  }
};

// Generates fallback values for any other state selected
export function getDistrictsForState(stateName: string): string[] {
  if (INDIAN_GEOGRAPHY[stateName]) {
    return Object.keys(INDIAN_GEOGRAPHY[stateName].districts);
  }
  // Generic fallbacks for states not fully mapped Offline
  return ["Central District", "North District", "South District", "East District", "West District"];
}

export function getTaluksForDistrict(stateName: string, districtName: string): string[] {
  if (INDIAN_GEOGRAPHY[stateName]?.districts[districtName]) {
    return Object.keys(INDIAN_GEOGRAPHY[stateName].districts[districtName].taluks);
  }
  return ["Central Taluk", "North Taluk", "South Taluk", "East Taluk", "West Taluk"];
}

export function getCitiesForTaluk(stateName: string, districtName: string, talukName: string): string[] {
  if (INDIAN_GEOGRAPHY[stateName]?.districts[districtName]?.taluks[talukName]) {
    return INDIAN_GEOGRAPHY[stateName].districts[districtName].taluks[talukName];
  }
  return ["Main Town", "Ward 1", "Ward 2", "Central Village", "Green City"];
}
