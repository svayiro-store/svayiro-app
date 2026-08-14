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

const INDIAN_STATE_DISTRICTS: Record<string, string[]> = {
  "Andhra Pradesh": [
    "Alluri Sitharama Raju", "Anakapalli", "Anantapur", "Annamayya", "Bapatla", "Chittoor", "Dr. B. R. Ambedkar Konaseema",
    "East Godavari", "Eluru", "Guntur", "Kakinada", "Krishna", "Kurnool", "Nandyal", "NTR", "Palnadu", "Parvathipuram Manyam",
    "Prakasam", "Sri Potti Sriramulu Nellore", "Sri Sathya Sai", "Srikakulam", "Tirupati", "Visakhapatnam", "Vizianagaram",
    "West Godavari", "YSR Kadapa"
  ],
  "Arunachal Pradesh": [
    "Anjaw", "Changlang", "Dibang Valley", "East Kameng", "East Siang", "Kamle", "Kra Daadi", "Kurung Kumey", "Lepa Rada",
    "Lohit", "Longding", "Lower Dibang Valley", "Lower Siang", "Lower Subansiri", "Namsai", "Pakke-Kessang", "Papum Pare",
    "Shi Yomi", "Siang", "Tawang", "Tirap", "Upper Siang", "Upper Subansiri", "West Kameng", "West Siang"
  ],
  "Assam": [
    "Baksa", "Barpeta", "Biswanath", "Bongaigaon", "Cachar", "Charaideo", "Chirang", "Darrang", "Dhemaji", "Dhubri",
    "Dibrugarh", "Dima Hasao", "Goalpara", "Golaghat", "Hailakandi", "Hojai", "Jorhat", "Kamrup", "Kamrup Metropolitan",
    "Karbi Anglong", "Karimganj", "Kokrajhar", "Lakhimpur", "Majuli", "Morigaon", "Nagaon", "Nalbari", "Sivasagar",
    "Sonitpur", "South Salmara-Mankachar", "Tamulpur", "Tinsukia", "Udalguri", "West Karbi Anglong"
  ],
  "Bihar": [
    "Araria", "Arwal", "Aurangabad", "Banka", "Begusarai", "Bhagalpur", "Bhojpur", "Buxar", "Darbhanga", "East Champaran",
    "Gaya", "Gopalganj", "Jamui", "Jehanabad", "Kaimur", "Katihar", "Khagaria", "Kishanganj", "Lakhisarai", "Madhepura",
    "Madhubani", "Munger", "Muzaffarpur", "Nalanda", "Nawada", "Patna", "Purnia", "Rohtas", "Saharsa", "Samastipur",
    "Saran", "Sheikhpura", "Sheohar", "Sitamarhi", "Siwan", "Supaul", "Vaishali", "West Champaran"
  ],
  "Chhattisgarh": [
    "Balod", "Baloda Bazar", "Balrampur-Ramanujganj", "Bastar", "Bemetara", "Bijapur", "Bilaspur", "Dantewada", "Dhamtari",
    "Durg", "Gariaband", "Gaurela-Pendra-Marwahi", "Janjgir-Champa", "Jashpur", "Kabirdham", "Kanker", "Kondagaon",
    "Korba", "Korea", "Mahasamund", "Manendragarh-Chirmiri-Bharatpur", "Mohla-Manpur-Ambagarh Chowki", "Mungeli",
    "Narayanpur", "Raigarh", "Raipur", "Rajnandgaon", "Sakti", "Sarangarh-Bilaigarh", "Sukma", "Surajpur", "Surguja"
  ],
  "Goa": ["North Goa", "South Goa"],
  "Gujarat": [
    "Ahmedabad", "Amreli", "Anand", "Aravalli", "Banaskantha", "Bharuch", "Bhavnagar", "Botad", "Chhota Udaipur",
    "Dahod", "Dang", "Devbhoomi Dwarka", "Gandhinagar", "Gir Somnath", "Jamnagar", "Junagadh", "Kheda", "Kutch",
    "Mahisagar", "Mehsana", "Morbi", "Narmada", "Navsari", "Panchmahal", "Patan", "Porbandar", "Rajkot", "Sabarkantha",
    "Surat", "Surendranagar", "Tapi", "Vadodara", "Valsad"
  ],
  "Haryana": [
    "Ambala", "Bhiwani", "Charkhi Dadri", "Faridabad", "Fatehabad", "Gurugram", "Hisar", "Jhajjar", "Jind", "Kaithal",
    "Karnal", "Kurukshetra", "Mahendragarh", "Nuh", "Palwal", "Panchkula", "Panipat", "Rewari", "Rohtak", "Sirsa",
    "Sonipat", "Yamunanagar"
  ],
  "Himachal Pradesh": [
    "Bilaspur", "Chamba", "Hamirpur", "Kangra", "Kinnaur", "Kullu", "Lahaul and Spiti", "Mandi", "Shimla", "Sirmaur",
    "Solan", "Una"
  ],
  "Jharkhand": [
    "Bokaro", "Chatra", "Deoghar", "Dhanbad", "Dumka", "East Singhbhum", "Garhwa", "Giridih", "Godda", "Gumla",
    "Hazaribagh", "Jamtara", "Khunti", "Koderma", "Latehar", "Lohardaga", "Pakur", "Palamu", "Ramgarh", "Ranchi",
    "Sahibganj", "Seraikela Kharsawan", "Simdega", "West Singhbhum"
  ],
  "Karnataka": [
    "Bagalkote", "Ballari", "Belagavi", "Bengaluru Rural", "Bengaluru Urban", "Bidar", "Chamarajanagara", "Chikkaballapura",
    "Chikkamagaluru", "Chitradurga", "Dakshina Kannada", "Davanagere", "Dharwad", "Gadag", "Hassan", "Haveri", "Kalaburagi",
    "Kodagu", "Kolar", "Koppal", "Mandya", "Mysuru", "Raichur", "Ramanagara", "Shivamogga", "Tumakuru", "Udupi",
    "Uttara Kannada", "Vijayapura", "Vijayanagara", "Yadgir"
  ],
  "Kerala": [
    "Alappuzha", "Ernakulam", "Idukki", "Kannur", "Kasaragod", "Kollam", "Kottayam", "Kozhikode", "Malappuram",
    "Palakkad", "Pathanamthitta", "Thiruvananthapuram", "Thrissur", "Wayanad"
  ],
  "Madhya Pradesh": [
    "Agar Malwa", "Alirajpur", "Anuppur", "Ashoknagar", "Balaghat", "Barwani", "Betul", "Bhind", "Bhopal", "Burhanpur",
    "Chhatarpur", "Chhindwara", "Damoh", "Datia", "Dewas", "Dhar", "Dindori", "Guna", "Gwalior", "Harda", "Indore",
    "Jabalpur", "Jhabua", "Katni", "Khandwa", "Khargone", "Maihar", "Mandla", "Mandsaur", "Mauganj", "Morena",
    "Narmadapuram", "Narsinghpur", "Neemuch", "Niwari", "Pandhurna", "Panna", "Raisen", "Rajgarh", "Ratlam", "Rewa",
    "Sagar", "Satna", "Sehore", "Seoni", "Shahdol", "Shajapur", "Sheopur", "Shivpuri", "Sidhi", "Singrauli", "Tikamgarh",
    "Ujjain", "Umaria", "Vidisha"
  ],
  "Maharashtra": [
    "Ahmednagar", "Akola", "Amravati", "Aurangabad", "Beed", "Bhandara", "Buldhana", "Chandrapur", "Dhule", "Gadchiroli",
    "Gondia", "Hingoli", "Jalgaon", "Jalna", "Kolhapur", "Latur", "Mumbai City", "Mumbai Suburban", "Nagpur", "Nanded",
    "Nandurbar", "Nashik", "Osmanabad", "Palghar", "Parbhani", "Pune", "Raigad", "Ratnagiri", "Sangli", "Satara",
    "Sindhudurg", "Solapur", "Thane", "Wardha", "Washim", "Yavatmal"
  ],
  "Manipur": [
    "Bishnupur", "Chandel", "Churachandpur", "Imphal East", "Imphal West", "Jiribam", "Kakching", "Kamjong", "Kangpokpi",
    "Noney", "Pherzawl", "Senapati", "Tamenglong", "Tengnoupal", "Thoubal", "Ukhrul"
  ],
  "Meghalaya": [
    "East Garo Hills", "East Jaintia Hills", "East Khasi Hills", "Eastern West Khasi Hills", "North Garo Hills",
    "Ri Bhoi", "South Garo Hills", "South West Garo Hills", "South West Khasi Hills", "West Garo Hills", "West Jaintia Hills",
    "West Khasi Hills"
  ],
  "Mizoram": [
    "Aizawl", "Champhai", "Hnahthial", "Khawzawl", "Kolasib", "Lawngtlai", "Lunglei", "Mamit", "Saiha", "Saitual", "Serchhip"
  ],
  "Nagaland": [
    "Chumoukedima", "Dimapur", "Kiphire", "Kohima", "Longleng", "Mokokchung", "Mon", "Niuland", "Noklak", "Peren",
    "Phek", "Shamator", "Tseminyu", "Tuensang", "Wokha", "Zunheboto"
  ],
  "Odisha": [
    "Angul", "Balangir", "Balasore", "Bargarh", "Bhadrak", "Boudh", "Cuttack", "Deogarh", "Dhenkanal", "Gajapati",
    "Ganjam", "Jagatsinghpur", "Jajpur", "Jharsuguda", "Kalahandi", "Kandhamal", "Kendrapara", "Keonjhar", "Khordha",
    "Koraput", "Malkangiri", "Mayurbhanj", "Nabarangpur", "Nayagarh", "Nuapada", "Puri", "Rayagada", "Sambalpur",
    "Subarnapur", "Sundargarh"
  ],
  "Punjab": [
    "Amritsar", "Barnala", "Bathinda", "Faridkot", "Fatehgarh Sahib", "Fazilka", "Ferozepur", "Gurdaspur", "Hoshiarpur",
    "Jalandhar", "Kapurthala", "Ludhiana", "Malerkotla", "Mansa", "Moga", "Pathankot", "Patiala", "Rupnagar",
    "Sahibzada Ajit Singh Nagar", "Sangrur", "Shaheed Bhagat Singh Nagar", "Sri Muktsar Sahib", "Tarn Taran"
  ],
  "Rajasthan": [
    "Ajmer", "Alwar", "Anupgarh", "Balotra", "Banswara", "Baran", "Barmer", "Beawar", "Bharatpur", "Bhilwara", "Bikaner",
    "Bundi", "Chittorgarh", "Churu", "Dausa", "Deeg", "Didwana-Kuchaman", "Dholpur", "Dudu", "Dungarpur", "Gangapur City",
    "Hanumangarh", "Jaipur", "Jaipur Rural", "Jaisalmer", "Jalore", "Jhalawar", "Jhunjhunu", "Jodhpur", "Jodhpur Rural",
    "Karauli", "Kekri", "Khairthal-Tijara", "Kota", "Kotputli-Behror", "Nagaur", "Neem Ka Thana", "Pali", "Phalodi",
    "Pratapgarh", "Rajsamand", "Salumbar", "Sanchore", "Sawai Madhopur", "Shahpura", "Sikar", "Sirohi", "Sri Ganganagar",
    "Tonk", "Udaipur"
  ],
  "Sikkim": ["Gangtok", "Gyalshing", "Mangan", "Namchi", "Pakyong", "Soreng"],
  "Tamil Nadu": [
    "Ariyalur", "Chengalpattu", "Chennai", "Coimbatore", "Cuddalore", "Dharmapuri", "Dindigul", "Erode", "Kallakurichi",
    "Kancheepuram", "Kanniyakumari", "Karur", "Krishnagiri", "Madurai", "Mayiladuthurai", "Nagapattinam", "Namakkal",
    "Nilgiris", "Perambalur", "Pudukkottai", "Ramanathapuram", "Ranipet", "Salem", "Sivaganga", "Tenkasi", "Thanjavur",
    "Theni", "Thoothukudi", "Tiruchirappalli", "Tirunelveli", "Tirupathur", "Tiruppur", "Tiruvallur", "Tiruvannamalai",
    "Tiruvarur", "Vellore", "Viluppuram", "Virudhunagar"
  ],
  "Telangana": [
    "Adilabad", "Bhadradri Kothagudem", "Hanumakonda", "Hyderabad", "Jagtial", "Jangaon", "Jayashankar Bhupalpally",
    "Jogulamba Gadwal", "Kamareddy", "Karimnagar", "Khammam", "Komaram Bheem Asifabad", "Mahabubabad", "Mahabubnagar",
    "Mancherial", "Medak", "Medchal-Malkajgiri", "Mulugu", "Nagarkurnool", "Nalgonda", "Narayanpet", "Nirmal",
    "Nizamabad", "Peddapalli", "Rajanna Sircilla", "Rangareddy", "Sangareddy", "Siddipet", "Suryapet", "Vikarabad",
    "Wanaparthy", "Warangal", "Yadadri Bhuvanagiri"
  ],
  "Tripura": ["Dhalai", "Gomati", "Khowai", "North Tripura", "Sepahijala", "South Tripura", "Unakoti", "West Tripura"],
  "Uttar Pradesh": [
    "Agra", "Aligarh", "Ambedkar Nagar", "Amethi", "Amroha", "Auraiya", "Ayodhya", "Azamgarh", "Baghpat", "Bahraich",
    "Ballia", "Balrampur", "Banda", "Barabanki", "Bareilly", "Basti", "Bhadohi", "Bijnor", "Budaun", "Bulandshahr",
    "Chandauli", "Chitrakoot", "Deoria", "Etah", "Etawah", "Farrukhabad", "Fatehpur", "Firozabad", "Gautam Buddha Nagar",
    "Ghaziabad", "Ghazipur", "Gonda", "Gorakhpur", "Hamirpur", "Hapur", "Hardoi", "Hathras", "Jalaun", "Jaunpur",
    "Jhansi", "Kannauj", "Kanpur Dehat", "Kanpur Nagar", "Kasganj", "Kaushambi", "Kheri", "Kushinagar", "Lalitpur",
    "Lucknow", "Maharajganj", "Mahoba", "Mainpuri", "Mathura", "Mau", "Meerut", "Mirzapur", "Moradabad", "Muzaffarnagar",
    "Pilibhit", "Pratapgarh", "Prayagraj", "Raebareli", "Rampur", "Saharanpur", "Sambhal", "Sant Kabir Nagar",
    "Shahjahanpur", "Shamli", "Shravasti", "Siddharthnagar", "Sitapur", "Sonbhadra", "Sultanpur", "Unnao", "Varanasi"
  ],
  "Uttarakhand": [
    "Almora", "Bageshwar", "Chamoli", "Champawat", "Dehradun", "Haridwar", "Nainital", "Pauri Garhwal", "Pithoragarh",
    "Rudraprayag", "Tehri Garhwal", "Udham Singh Nagar", "Uttarkashi"
  ],
  "West Bengal": [
    "Alipurduar", "Bankura", "Birbhum", "Cooch Behar", "Dakshin Dinajpur", "Darjeeling", "Hooghly", "Howrah", "Jalpaiguri",
    "Jhargram", "Kalimpong", "Kolkata", "Malda", "Murshidabad", "Nadia", "North 24 Parganas", "Paschim Bardhaman",
    "Paschim Medinipur", "Purba Bardhaman", "Purba Medinipur", "Purulia", "South 24 Parganas", "Uttar Dinajpur"
  ],
  "Andaman and Nicobar Islands": ["Nicobar", "North and Middle Andaman", "South Andaman"],
  "Chandigarh": ["Chandigarh"],
  "Dadra and Nagar Haveli and Daman and Diu": ["Dadra and Nagar Haveli", "Daman", "Diu"],
  "Delhi": ["Central Delhi", "East Delhi", "New Delhi", "North Delhi", "North East Delhi", "North West Delhi", "Shahdara", "South Delhi", "South East Delhi", "South West Delhi", "West Delhi"],
  "Jammu and Kashmir": ["Anantnag", "Bandipora", "Baramulla", "Budgam", "Doda", "Ganderbal", "Jammu", "Kathua", "Kishtwar", "Kulgam", "Kupwara", "Poonch", "Pulwama", "Rajouri", "Ramban", "Reasi", "Samba", "Shopian", "Srinagar", "Udhampur"],
  "Ladakh": ["Kargil", "Leh"],
  "Lakshadweep": ["Lakshadweep"],
  "Puducherry": ["Karaikal", "Mahe", "Puducherry", "Yanam"]
};

function uniqueSorted(values: string[]) {
  return Array.from(new Set(values.filter(Boolean))).sort((a, b) => a.localeCompare(b));
}

// Generates offline values so the address form does not depend on map/geocoding APIs.
export function getDistrictsForState(stateName: string): string[] {
  const detailedDistricts = INDIAN_GEOGRAPHY[stateName] ? Object.keys(INDIAN_GEOGRAPHY[stateName].districts) : [];
  const statewideDistricts = INDIAN_STATE_DISTRICTS[stateName] || [];
  const districts = uniqueSorted([...statewideDistricts, ...detailedDistricts]);
  return districts.length > 0 ? districts : ["Central District", "North District", "South District", "East District", "West District"];
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
