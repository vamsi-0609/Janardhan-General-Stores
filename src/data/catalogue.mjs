/**
 * Janardhan General Stores static catalogue — REPRESENTATIVE items commonly found in a traditional Indian Kirana and
 * Puja Samagri store. This is NOT a confirmation of actual stock. No prices, brands, offers, ratings or
 * availability are stated anywhere on purpose.
 *
 * Product tuple: [slug, English name, Telugu name, aliases (transliterations / other names), description, photo query]
 *   - The photo query is only used by scripts/fetch-images.mjs to find a freely-licensed photo on Wikimedia Commons.
 *   - To pin a specific Commons file, put it in IMAGE_OVERRIDES (scripts/image-overrides.mjs).
 */

export const sections = [
  {
    slug: 'kirana',
    name: 'Kirana',
    te: 'కిరాణా',
    title: 'Kirana & Groceries',
    blurb: 'Everyday groceries for an Andhra kitchen — rice, dals, oils, spices, dry fruits and household needs.',
    blurbTe: 'బియ్యం, పప్పులు, నూనెలు, మసాలాలు మరియు ఇంటి అవసరాలు.',
    theme: 'kirana',
  },
  {
    slug: 'puja-samagri',
    name: 'Puja Samagri',
    te: 'పూజా సామగ్రి',
    title: 'Puja Samagri',
    blurb: 'Items for daily puja, kalasam, vratams and homams — kumkum, sugandhalu, coconuts, camphor, agarbatti, clay diyas and more.',
    blurbTe: 'నిత్య పూజ, వ్రతాలు మరియు పండుగలకు కావలసిన సామగ్రి.',
    theme: 'puja',
  },
]

const P = (slug, name, te, aliases, desc, q) => ({ slug, name, te, aliases, desc, q })

export const categories = [
  // ───────────────────────────── KIRANA ─────────────────────────────
  {
    section: 'kirana', slug: 'rice', name: 'Rice', te: 'బియ్యం',
    blurb: 'Masoori, basmati and uppudu biyyam — in packets or loose by the kg.',
    products: [
      { ...P('sona-masoori-rice', 'Masoori Rice', 'మసూరి బియ్యం', ['sona masoori', 'sona masuri', 'masura rice', 'masuri biyyam', 'normal rice', 'biyyam', 'rice', 'rice packet', 'rice bag'], 'Everyday medium-grain rice for daily meals — in packets or loose by the kg.', 'Sona Masuri rice grains'), sizes: 'Packets · loose by the kg' },
      { ...P('basmati-rice', 'Basmati Rice', 'బాస్మతి బియ్యం', ['basmathi', 'biryani rice', 'long grain', 'rice packet'], 'Long-grain aromatic rice for biryani, pulao and fried rice — in packets or loose by the kg.', 'basmati rice uncooked'), sizes: 'Packets · loose by the kg' },
      { ...P('boiled-rice', 'Uppudu Biyyam (Boiled Rice)', 'ఉప్పుడు బియ్యం', ['uppudu biyyam', 'boiled rice', 'parboiled rice', 'rice packet'], 'Parboiled rice with firm grains that stay separate after cooking — in packets or loose by the kg.', 'parboiled rice'), sizes: 'Packets · loose by the kg' },
    ],
  },
  {
    section: 'kirana', slug: 'pulses-dals', name: 'Pulses & Dals', te: 'పప్పులు',
    blurb: 'Dals, whole pulses and gram.',
    products: [
      P('toor-dal', 'Toor Dal (Kandi Pappu)', 'కంది పప్పు', ['kandi pappu', 'kandipappu', 'arhar', 'tuvar', 'pigeon pea'], 'Split pigeon peas — the everyday dal for pappu, sambar and rasam.', 'toor dal pigeon pea split'),
      P('moong-dal', 'Moong Dal (Pesara Pappu)', 'పెసర పప్పు', ['pesara pappu', 'pesarapappu', 'mung dal', 'yellow moong'], 'Split, husked green gram that cooks quickly.', 'moong dal yellow split'),
      P('green-gram', 'Green Gram (Pesalu)', 'పెసలు', ['pesalu', 'whole moong', 'mung beans'], 'Whole green gram, used for pesarattu, sprouts and curries.', 'mung beans green gram'),
      P('urad-dal', 'Urad Dal (Minapa Pappu)', 'మినప పప్పు', ['minapa pappu', 'minappappu', 'black gram', 'urad'], 'Husked black gram, essential for idli, dosa, vada and tempering.', 'urad dal white split'),
      P('chana-dal', 'Chana Dal (Senaga Pappu)', 'శనగ పప్పు', ['senaga pappu', 'senagapappu', 'bengal gram'], 'Split Bengal gram for dals, tempering and sweets.', 'chana dal'),
      P('kabuli-chana', 'Kabuli Chana (Chickpeas)', 'కాబూలీ శనగలు', ['chickpeas', 'chole', 'white chana', 'senagalu'], 'Large white chickpeas for chole, curries and salads.', 'chickpeas dried'),
      P('black-chana', 'Black Chickpeas', 'నల్ల శనగలు', ['kala chana', 'nalla senagalu', 'brown chana'], 'Small dark chickpeas, often used for guggillu and curries.', 'kala chana black chickpeas'),
      P('masoor-dal', 'Masoor Dal (Red Lentils)', 'మసూర్ పప్పు', ['masoor', 'red lentils', 'erra pappu'], 'Split red lentils that cook soft and fast.', 'red lentils masoor'),
      P('roasted-gram', 'Roasted Gram (Putnala Pappu)', 'పుట్నాల పప్పు', ['putnalu', 'putnala pappu', 'dalia', 'pappulu'], 'Roasted split gram for chutneys and snacks.', 'roasted chana dalia'),
      P('horse-gram', 'Horse Gram (Ulavalu)', 'ఉలవలు', ['ulavalu', 'kulthi', 'horsegram'], 'A traditional pulse used for ulava charu and rasam.', 'horse gram seeds'),
      P('rajma', 'Rajma (Kidney Beans)', 'రాజ్మా', ['kidney beans', 'rajma beans'], 'Red kidney beans for curries.', 'red kidney beans'),
      P('groundnuts', 'Groundnuts (Palli)', 'వేరుశనగ పప్పు', ['palli', 'pallilu', 'peanuts', 'verusenaga'], 'Raw peanuts for chutneys, tempering, snacks and chikki.', 'raw peanuts'),
    ],
  },
  {
    section: 'kirana', slug: 'flours', name: 'Atta & Flours', te: 'పిండి రకాలు',
    blurb: 'Wheat atta, besan, rice flour and millet flours.',
    products: [
      P('wheat-atta', 'Wheat Flour (Atta)', 'గోధుమ పిండి', ['godhuma pindi', 'atta', 'chapati flour'], 'Whole wheat flour for chapati, roti and puri.', 'whole wheat flour atta'),
      P('maida', 'Maida (Refined Flour)', 'మైదా పిండి', ['maida', 'all purpose flour', 'refined flour'], 'Refined wheat flour for parotta, baking and snacks.', 'flour heap white'),
      P('besan', 'Besan (Gram Flour)', 'శనగ పిండి', ['senaga pindi', 'gram flour', 'chickpea flour'], 'Gram flour for bajji, pakodi, kadhi and sweets.', 'besan gram flour'),
      P('rice-flour', 'Rice Flour', 'బియ్యపు పిండి', ['biyyam pindi', 'biyyapu pindi'], 'Fine rice flour for murukulu, rotti and traditional sweets.', 'rice flour'),
      P('ragi-flour', 'Ragi Flour', 'రాగి పిండి', ['ragi', 'finger millet', 'ragulu'], 'Finger millet flour for ragi sangati, malt and rotti.', 'ragi finger millet'),
      P('jowar-flour', 'Jowar Flour', 'జొన్న పిండి', ['jonna pindi', 'jonnalu', 'sorghum'], 'Sorghum flour for jonna rotte.', 'sorghum grain jowar'),
      P('corn-flour', 'Corn Flour', 'మొక్కజొన్న పిండి', ['mokkajonna pindi', 'cornflour', 'corn starch'], 'Corn starch used for thickening and frying batters.', 'cornmeal maize flour'),
    ],
  },
  {
    section: 'kirana', slug: 'cooking-oils', name: 'Cooking Oils & Ghee', te: 'వంట నూనెలు & నెయ్యి',
    blurb: 'Groundnut, sunflower, sesame and other oils, plus ghee.',
    products: [
      { ...P('groundnut-oil', 'Groundnut Oil', 'వేరుశనగ నూనె', ['palli nune', 'peanut oil', 'verusenaga nune', 'oil packet', 'oil can', '15 litre can'], 'Groundnut oil for everyday Andhra cooking — in 1 litre packets and 15 litre cans.', 'peanut oil bottle'), brands: ['Freedom', 'Priya', 'Gold Drop'], sizes: '1 litre packets · 15 litre cans' },
      { ...P('sunflower-oil', 'Sunflower Oil', 'పొద్దుతిరుగుడు నూనె', ['sunflower nune', 'refined oil', 'oil packet', 'oil can', '15 litre can'], 'Refined sunflower oil for cooking and frying — in 1 litre packets and 15 litre cans.', 'sunflower oil'), brands: ['Freedom', 'Priya', 'Gold Drop'], sizes: '1 litre packets · 15 litre cans' },
      P('rice-bran-oil', 'Rice Bran Oil', 'రైస్ బ్రాన్ నూనె', ['rice bran'], 'An oil extracted from rice bran, used for cooking and frying.', 'cooking oil bottle glass'),
      P('sesame-oil', 'Sesame Oil (Gingelly)', 'నువ్వుల నూనె', ['nuvvula nune', 'til oil', 'gingelly oil'], 'Sesame oil used for pickles, podis and traditional cooking.', 'sesame oil'),
      P('coconut-oil', 'Coconut Oil', 'కొబ్బరి నూనె', ['kobbari nune'], 'Coconut oil for cooking and household use.', 'coconut oil jar'),
      { ...P('palmolein-oil', 'Palm Oil (Palmolein)', 'పామాయిల్', ['palm oil', 'pamoil', 'palmolein', 'oil packet', 'oil can', '15 litre can'], 'An economical refined oil for cooking and frying — in 1 litre packets and 15 litre cans.', 'palm oil'), brands: ['Freedom', 'Priya', 'Gold Drop'], sizes: '1 litre packets · 15 litre cans' },
      P('mustard-oil', 'Mustard Oil', 'ఆవ నూనె', ['ava nune', 'sarson oil'], 'A pungent oil used in pickles and some regional cooking.', 'mustard oil'),
      P('ghee', 'Ghee', 'నెయ్యి', ['neyyi', 'clarified butter'], 'Clarified butter for rice, sweets, tempering and puja.', 'ghee clarified butter'),
    ],
  },
  {
    section: 'kirana', slug: 'spices-masalas', name: 'Spices & Masalas', te: 'మసాలా దినుసులు',
    blurb: 'Whole spices, powders and masala blends.',
    products: [
      P('red-chilli-powder', 'Red Chilli Powder', 'కారం పొడి', ['karam', 'kaaram', 'mirchi powder', 'chilli powder'], 'Ground dried red chillies for everyday curries and pickles.', 'red chili powder'),
      P('dry-red-chillies', 'Dry Red Chillies', 'ఎండు మిరపకాయలు', ['endu mirapakayalu', 'endu mirchi', 'guntur chillies'], 'Whole dried chillies for tempering, podis and pickles.', 'dried red chillies'),
      P('turmeric-powder', 'Turmeric Powder', 'పసుపు పొడి', ['pasupu', 'haldi', 'tumeric', 'turmeric'], 'Ground turmeric used daily in cooking.', 'turmeric powder'),
      P('coriander-powder', 'Coriander Powder', 'ధనియాల పొడి', ['dhaniyala podi', 'dhania powder'], 'Ground coriander seeds for curries and masalas.', 'coriander powder'),
      P('coriander-seeds', 'Coriander Seeds', 'ధనియాలు', ['dhaniyalu', 'dhania'], 'Whole coriander seeds for podis and masala blends.', 'coriander seeds'),
      P('cumin-seeds', 'Cumin Seeds (Jeera)', 'జీలకర్ర', ['jeelakarra', 'jeera', 'jira', 'jilakara', 'jeelakara'], 'Whole cumin for tempering, rasam and jeera rice.', 'cumin seeds'),
      P('mustard-seeds', 'Mustard Seeds', 'ఆవాలు', ['avalu', 'rai', 'mustard', 'aavalu'], 'Small black mustard seeds — the start of most tadkas.', 'black mustard seeds'),
      P('fenugreek-seeds', 'Fenugreek Seeds', 'మెంతులు', ['menthulu', 'methi'], 'Used in dosa batter, pickles and tempering.', 'fenugreek seeds'),
      P('white-sesame', 'White Sesame Seeds (Nuvvulu)', 'తెల్ల నువ్వులు', ['nuvvulu', 'tella nuvvulu', 'nuvulu', 'white til', 'sesame'], 'White sesame seeds for chikki, podis, laddus and tempering.', 'white sesame seeds'),
      P('black-sesame', 'Black Sesame Seeds (Nalla Nuvvulu)', 'నల్ల నువ్వులు', ['nalla nuvvulu', 'nuvvulu', 'nuvulu', 'black til', 'sesame'], 'Black sesame seeds, used in cooking and also in some rituals.', 'black sesame seeds'),
      P('black-pepper', 'Black Pepper', 'మిరియాలు', ['miriyalu', 'pepper', 'kali mirch', 'miriyali'], 'Whole black peppercorns for rasam and seasoning.', 'black peppercorns'),
      P('cardamom', 'Cardamom', 'యాలకులు', ['yalakulu', 'elaichi', 'elachi', 'biryani spices', 'yalakalu'], 'Green cardamom pods for sweets, tea and biryani.', 'green cardamom pods'),
      P('cloves', 'Cloves', 'లవంగాలు', ['lavangalu', 'laung', 'biryani spices'], 'Whole cloves for biryani, masalas and tea.', 'cloves spice'),
      P('cinnamon', 'Cinnamon', 'దాల్చిన చెక్క', ['dalchina chekka', 'dalchini', 'biryani spices'], 'Cinnamon bark for biryani and garam masala.', 'cinnamon sticks'),
      P('garam-masala', 'Garam Masala', 'గరం మసాలా', ['garam masala powder'], 'A warm blend of ground spices for curries and biryani.', 'garam masala spices'),
      P('sambar-powder', 'Sambar Powder', 'సాంబార్ పొడి', ['sambar podi', 'sambhar masala'], 'A ground spice blend for sambar.', 'spice powder bowl'),
      P('asafoetida', 'Asafoetida (Hing)', 'ఇంగువ', ['inguva', 'hing', 'asafetida'], 'A strong-flavoured resin powder used in small amounts for tempering.', 'asafoetida'),
      P('tamarind', 'Tamarind', 'చింతపండు', ['chintapandu', 'imli'], 'Tamarind for pulusu, rasam, sambar and chutneys.', 'tamarind pulp'),
      P('star-anise', 'Star Anise', 'అనాస పువ్వు', ['anasa puvvu', 'chakri phool', 'biryani spices', 'anasa puvvu'], 'Star-shaped whole spice used in biryani and masalas.', 'star anise'),
      P('bay-leaves', 'Bay Leaves', 'బిర్యానీ ఆకు', ['biryani aku', 'tej patta', 'biryani spices', 'biriyani aku'], 'Dried leaves used whole in biryani and pulao.', 'bay leaves dried'),
    ],
  },
  {
    section: 'kirana', slug: 'sugar-salt-jaggery', name: 'Sugar, Salt & Jaggery', te: 'చక్కెర, ఉప్పు & బెల్లం',
    blurb: 'Sweeteners and salt for every kitchen.',
    products: [
      P('sugar', 'Sugar', 'చక్కెర', ['panchadara', 'chakkera', 'cheeni'], 'White crystal sugar for tea, coffee and sweets.', 'white sugar crystals'),
      P('salt', 'Iodised Salt', 'ఉప్పు', ['uppu', 'table salt'], 'Fine iodised salt for daily cooking.', 'table salt'),
      P('crystal-salt', 'Crystal Salt', 'రాళ్ల ఉప్పు', ['kallu uppu', 'rallu uppu', 'sea salt'], 'Coarse crystal salt used for pickles and cooking.', 'coarse sea salt crystals'),
      P('rock-salt', 'Rock Salt', 'సైంధవ లవణం', ['saindhava lavanam', 'sendha namak', 'pink salt'], 'Mineral rock salt, often used during fasting.', 'rock salt himalayan'),
      P('jaggery', 'Jaggery', 'బెల్లం', ['bellam', 'gud', 'gur'], 'Unrefined cane sugar in blocks, used for sweets and payasam.', 'jaggery'),
      P('jaggery-powder', 'Jaggery Powder', 'బెల్లం పొడి', ['bellam podi', 'gud powder'], 'Powdered jaggery that dissolves easily.', 'jaggery powder'),
      P('sugar-candy', 'Sugar Candy (Patika Bellam)', 'పటిక బెల్లం', ['patika bellam', 'misri', 'kalkandu'], 'Crystallised sugar lumps, also used as naivedyam.', 'rock sugar crystals'),
      P('palm-jaggery', 'Palm Jaggery', 'తాటి బెల్లం', ['tati bellam', 'karupatti'], 'Jaggery made from palm sap.', 'palm jaggery'),
    ],
  },
  {
    section: 'kirana', slug: 'dry-fruits', name: 'Dry Fruits & Nuts', te: 'డ్రై ఫ్రూట్స్',
    blurb: 'Cashews, badam, pista, dry dates and raisins.',
    products: [
      P('cashew-nuts', 'Cashew Nuts', 'జీడిపప్పు', ['jeedipappu', 'kaju', 'cashew', 'jeedi pappu'], 'Whole cashews for sweets, biryani and snacking.', 'cashew nuts'),
      P('almonds', 'Almonds', 'బాదం పప్పు', ['badam', 'badam pappu'], 'Whole almonds for snacking and sweets.', 'almonds'),
      P('raisins', 'Raisins', 'ఎండు ద్రాక్ష', ['kismis', 'kishmish', 'endu draksha', 'yendu draksha'], 'Dried grapes for payasam, kesari and sweets.', 'raisins'),
      P('dates', 'Dry Dates (Endu Kharjuram)', 'ఎండు ఖర్జూరం', ['kharjuram', 'khajur', 'yendu kajjuram', 'endu kharjuram', 'yendu karjuram'], 'Soft dried dates.', 'dates fruit dried'),
      P('pistachios', 'Pistachios', 'పిస్తా', ['pista'], 'Pistachio nuts for sweets and snacking.', 'pistachios'),
    ],
  },
  {
    section: 'kirana', slug: 'beverages', name: 'Tea, Coffee & Drinks', te: 'టీ, కాఫీ & పానీయాలు',
    blurb: 'Tea powder, instant coffee, soft drinks and drinking water bottles.',
    products: [
      P('tea-powder', 'Tea Powder', 'టీ పొడి', ['chai', 'tea dust', 'tea leaves', 'tea podi'], 'Black tea for everyday chai.', 'black tea leaves CTC'),
      P('instant-coffee', 'Instant Coffee Powder', 'ఇన్‌స్టంట్ కాఫీ పొడి', ['coffee', 'coffee powder', 'coffee podi', 'nescafe'], 'Soluble coffee powder for a quick cup.', 'instant coffee granules'),
      P('soft-drinks', 'Soft Drinks', 'కూల్ డ్రింక్స్', ['cool drinks', 'soda', 'cold drink'], 'Carbonated soft drinks.', 'soft drink glass bottles'),
      P('packaged-water', 'Packaged Drinking Water', 'మంచినీళ్ల బాటిల్', ['water bottle', 'mineral water', 'neellu', 'drinking water'], 'Bottled drinking water.', 'drinking water bottle'),
    ],
  },
  {
    section: 'kirana', slug: 'rava-poha-vermicelli', name: 'Rava, Poha & Vermicelli', te: 'రవ్వ, అటుకులు & సేమియా',
    blurb: 'Breakfast staples for upma, idli and more.',
    products: [
      P('bombay-rava', 'Bombay Rava (Sooji)', 'బొంబాయి రవ్వ', ['upma rava', 'sooji', 'suji', 'semolina'], 'Fine semolina for upma, kesari and rava dosa.', 'semolina'),
      P('idli-rava', 'Idli Rava', 'ఇడ్లీ రవ్వ', ['idly rava', 'rice rava'], 'Coarse rice rava for soft idlis.', 'idli rava'),
      P('wheat-rava', 'Wheat Rava (Godhuma Rava)', 'గోధుమ రవ్వ', ['godhuma rava', 'dalia', 'broken wheat'], 'Broken wheat for upma and kichdi.', 'broken wheat bulgur'),
      P('poha', 'Poha (Atukulu)', 'అటుకులు', ['atukulu', 'beaten rice', 'flattened rice', 'aval'], 'Flattened rice for poha, upma and snacks.', 'poha flattened rice'),
      P('vermicelli', 'Vermicelli (Semiya)', 'సేమియా', ['semiya', 'seviyan', 'sevai'], 'Thin wheat noodles for payasam and upma.', 'vermicelli'),
      P('macaroni', 'Macaroni', 'మాక్రోని', ['macroni', 'macaroni', 'pasta'], 'Short pasta tubes, often cooked Indian-style with vegetables and masala.', 'macaroni pasta uncooked'),
      P('sago', 'Sago (Saggubiyyam)', 'సగ్గుబియ్యం', ['saggubiyyam', 'sabudana', 'javvarisi'], 'Sago pearls for payasam, vada and khichdi.', 'sago pearls tapioca'),
      P('puffed-rice', 'Puffed Rice (Borugulu)', 'బొరుగులు', ['borugulu', 'maramaralu', 'murmura'], 'Light puffed rice for snacks and bhel.', 'puffed rice'),
    ],
  },
  {
    section: 'kirana', slug: 'household-cleaning', name: 'Household Cleaning', te: 'ఇంటి శుభ్రత',
    blurb: 'Laundry, dishwashing and home cleaning.',
    products: [
      { ...P('detergent-powder', 'Detergent Powder (Surf)', 'సర్ఫ్ / డిటర్జెంట్ పౌడర్', ['surf', 'surf packet', 'washing powder', 'detergent', 'battala powder'], 'Washing powder for clothes, from small ₹10 packets up to 1 kg and 3 kg packs.', 'laundry detergent powder'), brands: ['Tide', 'Rin', 'Ariel'], sizes: '₹10 packets · 1 kg · 3 kg' },
      P('washing-bar', 'Washing Bar Soap (Battala Sabbu)', 'బట్టల సబ్బు', ['battala sabbu', 'battala sabbulu', 'detergent bar', 'washing soap', 'cloth soap'], 'Bar soaps for washing clothes.', 'laundry soap bar'),
      P('dishwash-bar', 'Utensil Soap (Bokula Sabbu)', 'బోకుల సబ్బు', ['bokula sabbu', 'bokula sabbulu', 'ginnela sabbu', 'vessel soap', 'dishwash bar', 'utensil bar'], 'Bar soap for washing utensils and vessels.', 'dishwashing bar soap'),
      { ...P('dishwash-liquid', 'Dishwash Liquid', 'బోకులు కడిగే లిక్విడ్', ['vim liquid', 'dish wash gel', 'vessel liquid', 'utensil liquid', 'bokula liquid'], 'Liquid cleaner for washing utensils.', 'dishwashing liquid bottle'), brands: ['Vim'] },
      { ...P('floor-cleaner', 'Floor Cleaner (Lizol)', 'ఫ్లోర్ క్లీనర్', ['lizol', 'floor liquid', 'floor cleaner', 'mopping liquid'], 'Fragrant floor-cleaning liquid for mopping.', 'floor mop bucket cleaning'), brands: ['Lizol'] },
      P('phenyl', 'Phenyl (Penoil)', 'ఫినాయిల్', ['phenyl', 'phenoyl', 'penoil', 'finayil', 'white phenyl'], 'White phenyl for mopping floors and cleaning drains.', 'phenyl bottle'),
      P('toilet-cleaner', 'Toilet Cleaner', 'టాయిలెట్ క్లీనర్', ['toilet liquid', 'harpic', 'toilet cleaning'], 'Thick liquid cleaner for toilet bowls.', 'cleaning products bottles'),
      P('bathroom-cleaner', 'Bathroom Cleaner', 'బాత్‌రూమ్ క్లీనర్', ['bathroom liquid', 'tile cleaner', 'harpic bathroom'], 'Liquid cleaner for bathroom tiles, taps and floors.', 'bathroom cleaner bottle'),
      P('bleaching-powder', 'Bleaching Powder', 'బ్లీచింగ్ పౌడర్', ['bleach'], 'Disinfecting powder for drains and outdoor cleaning.', 'calcium hypochlorite powder'),
      P('broom', 'Broom', 'చీపురు', ['cheepuru', 'jhadu', 'kattalu'], 'Traditional grass and coconut-stick brooms.', 'indian broom'),
      P('scrub-pad', 'Scrub Pad & Steel Wool', 'స్క్రబ్బర్', ['scrubber', 'steel wool', 'sponge'], 'Scrubbers for cleaning vessels.', 'scouring pad sponge'),
      { ...P('mosquito-coil', 'Mosquito Repellent Coil', 'దోమల కాయిల్', ['domala coil', 'mosquito coil', 'jet coil'], 'Slow-burning coil to keep mosquitoes away.', 'mosquito coil'), brands: ['Jet'] },
      { ...P('insect-spray', 'Insect Spray', 'దోమలు, బొద్దింకల స్ప్రే', ['hit spray', 'mosquito spray', 'cockroach spray', 'insect killer', 'domala spray'], 'Sprays for mosquitoes, flies and cockroaches.', 'insecticide spray'), brands: ['HIT'] },
    ],
  },
  {
    section: 'kirana', slug: 'personal-care', name: 'Personal Care', te: 'వ్యక్తిగత సంరక్షణ',
    blurb: 'Soaps, shampoo sachets, seekakaya, toothpaste, brushes and sanitary pads.',
    products: [
      { ...P('bath-soap', 'Bath Soap (Ollu Sabbu)', 'ఒళ్ళు సబ్బు', ['ollu sabbu', 'ollu sabbulu', 'snanam sabbu', 'sabbu', 'soap', 'bathing soap', 'body soap'], 'Soap bars for bathing.', 'bar of soap'), brands: ['Cinthol', 'Mysore Sandal', 'Santoor'] },
      { ...P('shampoo', 'Shampoo Sachets', 'షాంపూ ప్యాకెట్లు', ['shampoo', 'shampoo packet', 'shampoo sachet', 'hair wash'], 'Shampoo in small single-use sachets.', 'shampoo sachets'), brands: ['Chik', 'Clinic Plus', 'Head & Shoulders', 'Meera', 'Karthika'], sizes: 'Sachets' },
      P('shikakai', 'Seekakaya Powder (Shikakai)', 'శీకాకాయ పొడి', ['seekakaya', 'sheekaya', 'shikakai', 'hair wash powder'], 'Traditional herbal hair-wash powder.', 'shikakai'),
      P('toothpaste', 'Toothpaste', 'టూత్‌పేస్ట్', ['paste', 'tooth paste'], 'Toothpaste for daily oral care.', 'toothpaste on toothbrush'),
      P('toothbrush', 'Toothbrush', 'టూత్‌బ్రష్', ['brush', 'tooth brush', 'brushes'], 'Toothbrushes in different sizes.', 'toothbrushes'),
      P('sanitary-pads', 'Sanitary Pads', 'శానిటరీ ప్యాడ్స్', ['pads', 'sanitary napkins', 'women pads', 'napkin'], 'Sanitary pads for women.', 'sanitary napkin'),
    ],
  },
  {
    section: 'kirana', slug: 'daily-essentials', name: 'Daily Essentials', te: 'నిత్యావసరాలు',
    blurb: 'Noodles, appalalu, vadiyalu, matchboxes and other daily needs.',
    products: [
      P('papad', 'Papad (Appalalu / Appadalu)', 'అప్పళాలు / అప్పడాలు', ['appalalu', 'appadalu', 'appalam', 'papadam', 'papad'], 'Sun-dried lentil wafers to roast or fry and serve with meals.', 'papadum'),
      P('vadiyalu', 'Vadiyalu', 'వడియాలు', ['vadiyalu', 'vadagalu', 'fryums'], 'Sun-dried fryums to fry and serve with meals.', 'sun dried vadam'),
      { ...P('instant-noodles', 'Instant Noodles', 'నూడుల్స్', ['noodles', 'maggi', 'maggie', 'yippee', 'yipee', 'noodles packet'], 'Quick-cooking noodles, from small single packs to large family packs.', 'instant noodles cooked'), brands: ['Maggi', 'Yippee'], sizes: 'Small single packs to large family packs' },
      P('baking-soda', 'Baking Soda', 'వంట సోడా', ['tinepu soda', 'soda uppu', 'cooking soda'], 'Sodium bicarbonate for batters and baking.', 'baking soda sodium bicarbonate'),
      P('matchboxes', 'Matchboxes', 'అగ్గిపెట్టె', ['aggipette', 'match box', 'matches'], 'Safety matches for the kitchen and puja.', 'matchsticks'),
      P('candles', 'Candles', 'కొవ్వొత్తులు', ['kovvottulu', 'candle'], 'White candles for power cuts and daily use.', 'white candles burning'),
      P('batteries', 'Batteries', 'బ్యాటరీలు', ['cells', 'AA battery', 'battery'], 'Common household battery sizes.', 'AA batteries'),
    ],
  },

  {
    section: 'kirana', slug: 'paper-plates-cups', name: 'Plates, Cups & Dhonnelu', te: 'ప్లేట్లు, కప్పులు & దొన్నెలు',
    blurb: 'Buffet plates, paper plates, tea cups, paper glasses and leaf dhonnelu for marriages, functions and prasadam.',
    products: [
      { ...P('buffet-plates', 'Buffet Plates', 'బఫే ప్లేట్లు', ['buffae plates', 'buffet plate', 'paper plates', 'disposable plates', 'marriage plates', 'function plates', 'leaf plates'], 'Disposable buffet plates for marriages, functions and parties.', 'paper plates'), caution: 'Use only for cool or room-temperature food and drinks. These have a very thin polythene layer inside, so regular use with hot items is not recommended.', cautionTe: 'చల్లని లేదా సాధారణ ఉష్ణోగ్రత ఉన్న పదార్థాలకు మాత్రమే వాడండి. లోపల చాలా పలుచని పాలిథీన్ పొర ఉంటుంది, కాబట్టి వేడి పదార్థాలకు తరచుగా వాడటం మంచిది కాదు.' },
      { ...P('paper-tea-cups', 'Paper Tea Cups', 'పేపర్ టీ కప్పులు', ['tea cups', 'paper cups', 'paper tea cup', 'disposable cups', 'chai cups'], 'Small disposable paper cups for functions and gatherings.', 'paper cups'), caution: 'Use only for cool or room-temperature food and drinks. These have a very thin polythene layer inside, so regular use with hot items is not recommended.', cautionTe: 'చల్లని లేదా సాధారణ ఉష్ణోగ్రత ఉన్న పదార్థాలకు మాత్రమే వాడండి. లోపల చాలా పలుచని పాలిథీన్ పొర ఉంటుంది, కాబట్టి వేడి పదార్థాలకు తరచుగా వాడటం మంచిది కాదు.' },
      P('paper-plates', 'Paper Plates', 'పేపర్ ప్లేట్లు', ['paper plate', 'disposable plates', 'party plates', 'plain paper plates'], 'Plain disposable paper plates for everyday use and small functions.', 'paper plates'),
      P('paper-glasses', 'Paper Glasses', 'పేపర్ గ్లాసులు', ['paper glass', 'paper cups', 'disposable glasses', 'water glasses'], 'Disposable paper glasses for water and drinks at functions.', 'paper cups'),
      { ...P('prasadam-cups', 'Prasadam Cups (Dhonnelu)', 'ప్రసాదం దొన్నెలు', ['dhonnelu', 'donnelu', 'donne', 'dhonne', 'prasadam cups', 'prasadam cup', 'leaf cups', 'leaf bowls', 'aaku dhonnelu', 'vistari'], 'Small bowls made from dried leaves, used for serving prasadam, at temples and at functions.', 'leaf bowls') },
    ],
  },
  // ─────────────────────────── PUJA SAMAGRI ───────────────────────────
  // Owner-confirmed scope (Nov 2026): no metal/steel puja items (plates, vessels, bells, brass lamps),
  // no sacred threads or malas. Lamps are clay pramidas only, including ready ghee deepams.
  {
    section: 'puja-samagri', slug: 'kumkum-turmeric', name: 'Kumkum & Turmeric', te: 'కుంకుమ & పసుపు',
    blurb: 'Red and maroon kumkuma, pasupu and sindoor.',
    products: [
      P('kumkum', 'Red Kumkuma', 'ఎర్ర కుంకుమ', ['kumkum', 'kumkuma', 'kunkuma', 'roli', 'red kumkum'], 'Bright red kumkuma powder for tilak and daily puja.', 'kumkum powder'),
      P('maroon-kumkum', 'Maroon Kumkuma', 'ముదురు ఎరుపు కుంకుమ', ['kumkum', 'kumkuma', 'kunkuma', 'maroon kumkum', 'dark red kumkum'], 'Deep maroon-red kumkuma powder for tilak and puja.', 'kumkum powder'),
      P('puja-pasupu', 'Pasupu (Turmeric for Puja)', 'పసుపు', ['pasupu', 'haldi', 'turmeric'], 'Turmeric powder for puja, vratams and auspicious occasions.', 'turmeric powder heap'),
      P('turmeric-sticks', 'Turmeric Sticks (Pasupu Kommulu)', 'పసుపు కొమ్ములు', ['pasupu kommulu', 'turmeric root', 'haldi gaanth'], 'Dried turmeric roots used in puja and for grinding.', 'dried turmeric fingers'),
      P('sindoor', 'Sindoor', 'సింధూరం', ['sinduram', 'sindhoor'], 'Orange-red sindoor powder used in worship.', 'sindoor powder'),
      P('pasupu-kumkum-set', 'Pasupu-Kumkum Set', 'పసుపు కుంకుమ సెట్', ['vayanam', 'haldi kumkum'], 'Pasupu and kumkum together, often offered to guests and during vratams.', 'haldi kumkum'),
    ],
  },
  {
    section: 'puja-samagri', slug: 'kalasam-sugandhalu', name: 'Kalasam Sugandhalu', te: 'కలశం సుగంధాలు',
    blurb: 'Kalasam samanlu — pacha karpuram, jajikaya, japathri, lavangalu and yalakulu.',
    products: [
      P('pacha-karpuram', 'Pacha Karpuram', 'పచ్చ కర్పూరం', ['pacha karpuram', 'pachha karpooram', 'edible camphor', 'bhimseni', 'sugandhalu'], 'Edible camphor — one of the sugandhalu added to the kalasam and used in small amounts in prasadam.', 'camphor crystals'),
      P('jajikaya', 'Jajikaya (Nutmeg)', 'జాజికాయ', ['jajikaya', 'jaji kaya', 'nutmeg', 'jaiphal', 'sugandhalu', 'biryani spices'], 'Whole nutmeg, one of the sugandhalu placed in the kalasam water.', 'nutmeg whole'),
      P('japathri', 'Japathri (Mace)', 'జాపత్రి', ['japathri', 'japatri', 'mace', 'javitri', 'sugandhalu'], 'Mace — the fragrant covering of nutmeg, used among the kalasam sugandhalu.', 'mace spice javitri'),
      P('puja-lavangalu', 'Lavangalu (Cloves) for Kalasam', 'లవంగాలు', ['lavangalu', 'cloves', 'laung', 'sugandhalu'], 'Cloves used among the sugandhalu for the kalasam.', 'cloves spice'),
      P('puja-yalakulu', 'Yalakulu (Cardamom) for Kalasam', 'యాలకులు', ['yalakulu', 'yalakalu', 'elaichi', 'cardamom', 'sugandhalu'], 'Cardamom pods used among the sugandhalu for the kalasam.', 'green cardamom pods'),
      P('kalasam-samanlu-set', 'Kalasam Samanlu (Sugandhalu Set)', 'కలశం సామాన్లు', ['kalasam samanlu', 'kalisam samanlu', 'sugandhalu', 'sugandha dravyalu'], 'Pacha karpuram, jajikaya, japathri, lavangalu and yalakulu together for the kalasam. Ask the shop for the current set.', 'whole spices'),
    ],
  },
  {
    section: 'puja-samagri', slug: 'coconuts', name: 'Coconuts', te: 'కొబ్బరికాయలు',
    blurb: 'Tenkaya / kobbari kaya for puja and peechu tenkaya for the kalasam.',
    products: [
      { ...P('pooja-coconut', 'Coconut (Tenkaya / Kobbari Kaya)', 'కొబ్బరికాయ / టెంకాయ', ['tenkaya', 'tenkayalu', 'kobbarikaya', 'kobbari kaya', 'nariyal', 'coconut'], 'Husked coconuts for offering and breaking during puja. Priced by size.', 'coconut whole husked'), price: '₹30 – ₹45, depending on size', priceTe: '₹30 – ₹45, సైజును బట్టి' },
      P('kalasam-kayalu', 'Kalasam Kayalu (Peechu Tenkaya)', 'కలశం కాయలు / పీచు టెంకాయ', ['kalasam kayalu', 'kalisam kayalu', 'kalisam kaya', 'peechu tenkaya', 'peechu kobbarikaya', 'kalasa kobbari kaya', 'coconut with husk', 'juttu kobbarikaya'], 'Mature coconuts with their fibre (juttu) left on — the kind placed on top of the kalasam. Not tender green coconuts.', 'coconut with husk fibre'),
    ],
  },
  {
    section: 'puja-samagri', slug: 'camphor', name: 'Camphor', te: 'కర్పూరం',
    blurb: 'Karpuram billalu (camphor tablets) and gadda karpuram for harathi.',
    products: [
      P('camphor-tablets', 'Camphor Tablets (Karpuram Billalu)', 'కర్పూరం బిళ్ళలు', ['karpuram billalu', 'kampooram billalu', 'karpuram', 'karpooram', 'kapur', 'camphor', 'camphor tablets'], 'Small camphor tablets for harathi.', 'camphor tablets'),
      P('camphor-cubes', 'Gadda Karpuram', 'గడ్డ కర్పూరం', ['gadda karpuram', 'gadda karpooram', 'camphor block', 'camphor cubes', 'karpuram', 'camphor'], 'Camphor in larger lumps for harathi and homam.', 'camphor burning aarti'),
    ],
  },
  {
    section: 'puja-samagri', slug: 'incense-sticks', name: 'Incense Sticks', te: 'అగరబత్తీలు',
    blurb: 'Agarbatti in many fragrances, and loose packets from 150 g to 500 g.',
    products: [
      P('sandal-agarbatti', 'Sandalwood Incense Sticks', 'గంధం అగరబత్తీలు', ['agarbatti', 'agarbathi', 'agarabatti', 'chandan'], 'Agarbatti with a sandalwood fragrance.', 'incense sticks burning'),
      P('rose-agarbatti', 'Rose Incense Sticks', 'గులాబీ అగరబత్తీలు', ['agarbatti', 'gulabi', 'rose'], 'Agarbatti with a rose fragrance.', 'incense sticks smoke'),
      P('jasmine-agarbatti', 'Jasmine Incense Sticks', 'మల్లె అగరబత్తీలు', ['agarbatti', 'malle', 'mogra'], 'Agarbatti with a jasmine fragrance.', 'incense sticks holder'),
      P('sambrani-agarbatti', 'Sambrani Incense Sticks', 'సాంబ్రాణి అగరబత్తీలు', ['agarbatti', 'sambrani sticks', 'sambrani agarbatti'], 'Agarbatti with a sambrani (benzoin) fragrance.', 'incense sticks'),
      P('assorted-agarbatti', 'Assorted Fragrance Incense', 'వివిధ సువాసనల అగరబత్తీలు', ['agarbatti', 'mixed fragrance', 'flavour sticks'], 'Agarbatti in a mix of fragrances and colours.', 'incense sticks bundle'),
      { ...P('loose-agarbatti', 'Loose Incense Sticks (Packets)', 'లూజ్ అగరబత్తీలు', ['loose agarbatti', 'loose packets', 'agarbatti packet', 'agarbathi', 'normal agarbatti', 'incense sticks'], 'Plain incense sticks sold as loose packets for everyday puja.', 'incense sticks bundle'), sizes: '150 g to 500 g packets' },
    ],
  },
  {
    section: 'puja-samagri', slug: 'dhoop-sambrani', name: 'Dhoop & Sambrani', te: 'ధూపం & సాంబ్రాణి',
    blurb: 'Dhoop sticks, cones, sambrani and guggilam.',
    products: [
      P('dhoop-sticks', 'Dhoop Sticks', 'ధూప్ స్టిక్స్', ['dhoop', 'dhoopam', 'dhup batti'], 'Thick, bamboo-less incense sticks.', 'dhoop sticks'),
      P('dhoop-cones', 'Dhoop Cones', 'ధూప్ కోన్లు', ['dhoop cone', 'incense cone'], 'Cone-shaped dhoop for a short, fragrant burn.', 'incense cones'),
      P('sambrani-cups', 'Sambrani Cups', 'సాంబ్రాణి కప్పులు', ['sambrani', 'sambrani cup', 'dhoop cup'], 'Ready-to-light sambrani cups.', 'sambrani dhoop'),
      P('sambrani', 'Sambrani (Loban)', 'సాంబ్రాణి', ['sambrani', 'loban', 'benzoin'], 'Benzoin resin burnt on coal for fragrant smoke.', 'benzoin resin'),
      P('guggilam', 'Guggilam (Resin)', 'గుగ్గిలం', ['guggilam', 'guggul', 'dammar'], 'Aromatic resin used in dhoopam and homam.', 'frankincense resin'),
    ],
  },
  {
    section: 'puja-samagri', slug: 'wicks-deepam-oil', name: 'Wicks & Deepam Oil', te: 'వత్తులు & దీపం నూనె',
    blurb: 'Cotton wicks and oils for lighting the deepam.',
    products: [
      P('round-wicks', 'Round Cotton Wicks (Poo Vattulu)', 'పూ వత్తులు', ['poo vattulu', 'vattulu', 'wicks'], 'Small round cotton wicks for diyas.', 'cotton wicks diya'),
      P('long-wicks', 'Long Cotton Wicks', 'పొడవు వత్తులు', ['vattulu', 'long wicks', 'batti'], 'Long cotton wicks for deepam.', 'cotton wick'),
      P('ghee-wicks', 'Ghee Wicks', 'నెయ్యి వత్తులు', ['neyyi vattulu', 'ghee batti'], 'Cotton wicks pre-soaked in ghee.', 'ghee lamp wick'),
      P('lotus-stem-wicks', 'Lotus Stem Wicks', 'తామర వత్తులు', ['tamara vattulu', 'lotus wicks'], 'Traditional wicks made from lotus stem fibre.', 'oil lamp wick'),
      P('deepam-oil', 'Deepam Oil', 'దీపం నూనె', ['deepam oil', 'deepam nune', 'deepam noone', 'lamp oil', 'pooja oil', 'puja oil', 'diya oil'], 'Oil for lighting the deepam, sold separately in bottles.', 'oil lamp burning'),
      P('castor-oil', 'Castor Oil (Amudam)', 'ఆముదం', ['amudam', 'castor'], 'Traditional lamp oil.', 'castor oil'),
    ],
  },
  {
    section: 'puja-samagri', slug: 'clay-diyas', name: 'Clay Diyas & Deepams', te: 'మట్టి ప్రమిదలు & దీపాలు',
    blurb: 'Plain matti pramidalu, small and large, and ready neyyi deepams.',
    products: [
      P('clay-diyas', 'Small Matti Pramidalu', 'చిన్న మట్టి ప్రమిదలు', ['matti pramidalu', 'matti pramidhalu', 'pramidalu', 'pramida', 'matti deepalu', 'mud diya', 'clay diya', 'diya', 'karthika deepam'], 'Plain small terracotta pramidas for daily deepam, Karthika masam and Deepavali.', 'clay diya lamps'),
      P('akhanda-deepam', 'Large Matti Pramidalu', 'పెద్ద మట్టి ప్రమిదలు', ['big matti pramidalu', 'pedda pramida', 'big pramida', 'akhanda deepam', 'matti pramidalu', 'clay diya'], 'Bigger plain clay pramidas that hold more oil or ghee for a longer-burning deepam.', 'clay diya'),
      P('neyyi-deepam', 'Neyyi Deepam (Ghee Deepam)', 'నెయ్యి దీపం', ['neyyi deepam', 'ghee deepam', 'ghee diya', 'nei deepam'], 'A clay pramida that comes filled with ghee and a wick — ready to light.', 'ghee lamp'),
    ],
  },
  {
    section: 'puja-samagri', slug: 'pooja-kits', name: 'Pooja & Homam Kits', te: 'పూజా & హోమం కిట్లు',
    blurb: 'Grouped samagri for common pujas, vratams and homams.',
    products: [
      P('daily-pooja-kit', 'Daily Pooja Kit', 'నిత్య పూజా కిట్', ['pooja kit', 'puja kit'], 'Common items for everyday puja. Contents vary — please ask the shop.', 'puja items'),
      P('satyanarayana-kit', 'Satyanarayana Vratham Kit', 'సత్యనారాయణ వ్రతం కిట్', ['satyanarayana swamy vratham', 'vratham kit'], 'Samagri commonly needed for Satyanarayana Vratham. Contents vary — please ask the shop.', 'satyanarayana puja'),
      P('varalakshmi-kit', 'Varalakshmi Vratham Kit', 'వరలక్ష్మీ వ్రతం కిట్', ['varalakshmi vratham', 'lakshmi puja'], 'Samagri commonly needed for Varalakshmi Vratham. Contents vary — please ask the shop.', 'varalakshmi vratam'),
      P('gruhapravesam-kit', 'Gruhapravesam Kit', 'గృహప్రవేశం కిట్', ['gruhapravesam', 'house warming', 'griha pravesh'], 'Samagri commonly used for a house-warming puja. Contents vary — please ask the shop.', 'griha pravesh puja'),
      P('vinayaka-chavithi-kit', 'Vinayaka Chavithi Kit', 'వినాయక చవితి కిట్', ['ganesh chaturthi', 'vinayaka chavithi'], 'Samagri commonly needed for Vinayaka Chavithi. Contents vary — please ask the shop.', 'ganesh chaturthi puja items'),
      P('homam-kit', 'Homam Samagri Kit', 'హోమం సామగ్రి కిట్', ['homam', 'havan samagri', 'homa'], 'Items commonly used for homam. Contents vary — please ask the shop.', 'havan samagri'),
      P('purnahuthi-set', 'Purnahuthi Set', 'పూర్ణాహుతి సెట్', ['purnahuthi', 'poornahuti', 'purnahuti set', 'homam'], 'Items offered at the purnahuthi at the end of a homam. Contents vary — please ask the shop.', 'havan fire offering'),
      P('bhumi-puja-set', 'Bhumi Puja Set', 'భూమి పూజ సెట్', ['bhumi puja', 'bhoomi pooja', 'navadhanyalu', 'navaratnalu', 'nava ratnalu', 'navaratna', 'pancha lohalu', 'panchaloha', 'shankusthapana', 'foundation puja'], 'A set for bhumi puja (shankusthapana) with navadhanyalu, navaratnalu and pancha lohalu. Ask the shop about the current set.', 'navaratna nine gems'),
      P('deepavali-kit', 'Deepavali Lakshmi Pooja Kit', 'దీపావళి లక్ష్మీ పూజా కిట్', ['diwali puja', 'deepavali', 'lakshmi puja'], 'Samagri commonly needed for Deepavali Lakshmi Puja. Contents vary — please ask the shop.', 'diwali puja thali'),
    ],
  },
  {
    section: 'puja-samagri', slug: 'sandalwood', name: 'Sandalwood Products', te: 'గంధం ఉత్పత్తులు',
    blurb: 'Gandham powder, sticks and attar.',
    products: [
      P('sandalwood-powder', 'Sandalwood Powder (Gandham)', 'గంధం పొడి', ['gandham', 'chandan', 'chandanam'], 'Sandalwood powder for tilak and puja.', 'sandalwood powder'),
      P('sandalwood-stick', 'Sandalwood Stick', 'గంధపు చెక్క', ['gandham chekka', 'chandan stick'], 'A piece of sandalwood to rub into paste.', 'sandalwood'),
      P('sandal-attar', 'Sandalwood Attar', 'గంధం అత్తరు', ['attar', 'ittar', 'chandan attar'], 'A sandalwood-fragrance oil.', 'attar perfume bottle'),
      P('gopi-chandan', 'Gopi Chandan', 'గోపీ చందనం', ['gopi chandanam', 'tilak'], 'Clay used to apply tilak.', 'gopi chandan'),
      P('ashtagandham', 'Ashtagandham', 'అష్టగంధం', ['ashtagandha', 'astagandham'], 'A fragrant powder used for tilak and puja.', 'ashtagandha powder'),
    ],
  },
  {
    section: 'puja-samagri', slug: 'festival-essentials', name: 'Festival Essentials', te: 'పండుగ సామగ్రి',
    blurb: 'Muggu powder and rangoli colours for festival muggulu.',
    products: [
      P('muggu-powder', 'Muggu Powder', 'ముగ్గు పిండి', ['muggu', 'rangoli powder', 'kolam'], 'White powder for drawing muggulu.', 'kolam rangoli white'),
      P('rangoli-colours', 'Rangoli Colours', 'ముగ్గు రంగులు', ['muggu rangulu', 'rangoli colors'], 'Coloured powders for festival muggulu.', 'rangoli colours powder'),
    ],
  },
  {
    section: 'puja-samagri', slug: 'other-devotional', name: 'Homam & Other Puja Items', te: 'హోమం & ఇతర పూజా వస్తువులు',
    blurb: 'Homam pullalu, go muthram, ganga jalam, vakkalu, tamalapaku, prasadam dhonnelu, vibhuti and more.',
    products: [
      P('samidhalu', 'Homam Pullalu (Samidhalu)', 'హోమం పుల్లలు', ['homam pullalu', 'homa pullalu', 'samidhalu', 'samidha', 'havan sticks'], 'Small sticks offered into the homam fire.', 'havan wood sticks'),
      P('darbha', 'Darbha Grass', 'దర్భ', ['darbha', 'darba', 'kusha grass', 'dharbai'], 'Sacred grass used in rituals and homam.', 'kusha grass'),
      P('go-muthram', 'Go Muthram (Cow Urine)', 'గోమూత్రం', ['go muthram', 'gomutram', 'gomutra', 'cow muthram', 'cow urine'], 'Go muthram in bottles, used for purification in puja and homam.', 'bottle'),
      P('ganga-jalam', 'Ganga Jalam', 'గంగా జలం', ['ganga jalam', 'ganga jal', 'gangajal', 'holy water', 'ganga water'], 'Bottled Ganga water for puja, kalasam and purification.', 'Ganga jal bottle'),
      P('navadhanyalu', 'Navadhanyalu (Nine Grains)', 'నవధాన్యాలు', ['navadhanyam', 'nine grains', 'navagraha'], 'Nine grains offered in navagraha puja and homam.', 'navadhanya nine grains'),
      P('vakkalu', 'Betel Nuts (Vakkalu)', 'వక్కలు', ['vakkalu', 'supari', 'areca nut', 'poka chekka'], 'Areca nuts offered with betel leaves in tambulam.', 'areca nut'),
      P('tamalapaku', 'Tamalapaku (Betel Leaves)', 'తమలపాకు', ['tamalapaku', 'tamala paku', 'tamalapakulu', 'betel leaves', 'paan', 'tambulam'], 'Fresh betel leaves for tambulam and puja.', 'betel leaves'),
      { ...P('puja-prasadam-cups', 'Prasadam Cups (Dhonnelu)', 'ప్రసాదం దొన్నెలు', ['dhonnelu', 'donnelu', 'donne', 'dhonne', 'prasadam cups', 'prasadam cup', 'leaf cups', 'leaf bowls', 'aaku dhonnelu', 'vistari'], 'Small bowls made from dried leaves, used for serving prasadam, at temples and at functions.', 'leaf bowls'), photo: 'prasadam-cups' },
      P('vibhuti', 'Vibhuti', 'విభూతి', ['vibhudi', 'veebhudhi', 'bhasmam', 'sacred ash'], 'Sacred ash applied on the forehead.', 'vibhuti sacred ash'),
      P('vibhuti-pandu', 'Vibhuti Pandu', 'విభూతి పండు', ['vibhuti pandu', 'veebhudi pandu', 'vibhudi pandu', 'vibhuti balls', 'bhasmam balls'], 'Vibhuti pressed into balls, crushed fresh to apply.', 'vibhuti'),
      P('panneer', 'Rose Water (Panneer)', 'పన్నీరు', ['panneer', 'rose water', 'gulab jal'], 'Rose water for puja and sprinkling.', 'rose water'),
      P('honey', 'Honey', 'తేనె', ['thene', 'shahad'], 'Honey, used in panchamrutham.', 'honey jar'),
    ],
  },
]

// Derived helpers ---------------------------------------------------------------------------------
export const products = categories.flatMap((c) => c.products.map((p) => ({ ...p, category: c.slug, section: c.section })))

export function sectionOf(slug) {
  return sections.find((s) => s.slug === slug)
}
export function categoriesOf(sectionSlug) {
  return categories.filter((c) => c.section === sectionSlug)
}
export function categoryOf(slug) {
  return categories.find((c) => c.slug === slug)
}
