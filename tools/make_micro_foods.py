"""Build app/src/data/micro-foods.ts: vitamins and minerals of specific foods from USDA SR Legacy (public domain).

Usage: python -I tools/make_micro_foods.py <path-to-sr_legacy_csv-dir> app/src/data/micro-foods.ts

Each item below is a Russian/English name pattern plus a pattern over USDA descriptions. All USDA foods that
match become variants of the item (raw, boiled, fried...); the app picks the variant whose protein / fat / carbs
are closest to what the user entered (see lib/micros.ts). So «гречка» with 313 kcal resolves to dry buckwheat
and with 110 kcal to cooked.

In the name patterns `\\b` means "end of word" (the app rewrites it for Cyrillic). Order matters: first match wins.
"""
import csv
import json
import re
import sys

SRC, OUT = sys.argv[1], sys.argv[2]
MAX_VARIANTS = 6

NUTRIENTS = {
    'vit_a': 'Vitamin A, RAE', 'vit_c': 'Vitamin C, total ascorbic acid', 'vit_d': 'Vitamin D (D2 + D3)',
    'vit_e': 'Vitamin E (alpha-tocopherol)', 'vit_k': 'Vitamin K (phylloquinone)', 'b1': 'Thiamin', 'b2': 'Riboflavin',
    'b3': 'Niacin', 'b6': 'Vitamin B-6', 'b9': 'Folate, DFE', 'b12': 'Vitamin B-12', 'ca': 'Calcium, Ca', 'fe': 'Iron, Fe',
    'mg': 'Magnesium, Mg', 'p': 'Phosphorus, P', 'k': 'Potassium, K', 'zn': 'Zinc, Zn', 'se': 'Selenium, Se',
    'na': 'Sodium, Na', 'chol': 'Cholesterol',
}
MACROS = {'protein': 'Protein', 'fat': 'Total lipid (fat)', 'carb': 'Carbohydrate, by difference',
          'sugar': 'Sugars, Total', 'fiber': 'Fiber, total dietary', 'satfat': 'Fatty acids, total saturated'}
COLUMNS = ['protein', 'fat', 'carb', *NUTRIENTS, 'sugar', 'fiber', 'satfat']

# (name pattern, USDA description pattern, optional exclude pattern)
ITEMS = [
    # ——— grains, pasta, bread ———
    (r'гречк|гречнев|buckwheat', r'^Buckwheat groats, roasted, (cooked|dry)$'),
    (r'рис\S* бур|бурый рис|brown rice', r'^Rice, brown, long-grain, (cooked|raw)'),
    (r'рис\b|риса\b|рисов|rice\b', r'^Rice, white, long-grain, regular, (raw, unenriched|unenriched, cooked without salt)$'),
    (r'овсян|геркулес|oatmeal|oats\b', r'^Cereals, oats, regular and quick, (not fortified, dry|unenriched, cooked with water \(includes boiling and microwaving\), without salt)$'),
    (r'булгур|bulgur', r'^Bulgur, (cooked|dry)$'),
    (r'киноа|quinoa', r'^Quinoa, (cooked|uncooked)$'),
    (r'пшен|millet', r'^Millet, (cooked|raw)$'),
    (r'перлов|ячнев|barley', r'^Barley, pearled, (cooked|raw)$'),
    (r'кускус|couscous', r'^Couscous, (cooked|dry)$'),
    (r'манн|манк|semolina', r'^Semolina, unenriched$|^Cereals, farina, unenriched, cooked with water'),
    (r'кукурузн\S* (круп|каш)|полент|cornmeal|polenta', r'^Cornmeal, whole-grain, yellow$|^Cereals, corn grits, yellow, regular and quick, unenriched, cooked with water, without salt$'),
    (r'макарон|спагетти|паста\b|лапш|вермишел|pasta|spaghetti|noodle', r'^Pasta, (dry|cooked), unenriched'),
    (r'мука\b|муки\b|flour', r'^Wheat flour, white, all-purpose, unenriched$'),
    (r'отруб|bran\b', r'^Wheat bran, crude$|^Oat bran, raw$'),
    (r'хлеб\S* ржан|ржан\S* хлеб|бородин|rye bread', r'^Bread, rye$'),
    (r'хлеб\S* цельнозерн|цельнозерн\S* хлеб|whole.?wheat bread', r'^Bread, whole-wheat, commercially prepared$'),
    (r'лаваш|пита\b|pita|тортиль|tortilla', r'^Bread, pita, white, unenriched$|^Tortillas, ready-to-bake or -fry, flour, refrigerated$'),
    (r'хлебц|crispbread', r'^Crackers, crispbread, rye$'),
    (r'хлеб|батон|багет|булк|bread|baguette', r'^Bread, (white, commercially prepared \(includes soft bread crumbs\)|french or vienna \(includes sourdough\))$'),
    # ——— legumes ———
    (r'чечевиц|lentil', r'^Lentils, (raw|mature seeds, cooked, boiled, without salt)$'),
    (r'нут\b|нута\b|chickpea', r'^Chickpeas \(garbanzo beans, bengal gram\), mature seeds, (raw|cooked, boiled, without salt)$'),
    (r'фасол\S* стручк|стручков\S* фасол|green bean', r'^Beans, snap, green, (raw|cooked, boiled, drained, without salt)$'),
    (r'фасол|bean', r'^Beans, kidney, red, mature seeds, (raw|cooked, boiled, without salt|canned, drained solids)$'),
    (r'горох\b|гороха\b|split pea', r'^Peas, split, mature seeds, (raw|cooked, boiled, without salt)$'),
    (r'горошек|green pea', r'^Peas, green, (raw|cooked, boiled, drained, without salt)$|^Peas, green \(includes baby and lesuer types\), canned, drained solids'),
    (r'соя\b|соев\S* (бобы|мясо)|эдамаме|soybean|edamame', r'^Soybeans, mature seeds, (raw|cooked, boiled, without salt)$|^Edamame, frozen, prepared$'),
    (r'тофу|tofu', r'^Tofu, raw, (firm|regular), prepared with calcium sulfate$'),
    # ——— eggs (before poultry: «яйцо куриное» is an egg) ———
    (r'белок яи|яичн\S* белок|egg white', r'^Egg, white, raw, fresh$'),
    (r'желток|egg yolk', r'^Egg, yolk, raw, fresh$'),
    (r'яичниц|глазунь|fried egg', r'^Egg, whole, cooked, fried$'),
    (r'омлет|omelet|scrambled', r'^Egg, whole, cooked, (omelet|scrambled)$'),
    (r'перепелин', r'^Egg, quail, whole, fresh, raw$'),
    (r'яйцо\b|яйца\b|яиц\b|egg\b|eggs\b', r'^Egg, whole, (raw, fresh|cooked, hard-boiled)$'),
    # ——— poultry ———
    (r'(кури|курин|цыпл)\S* (грудк|филе)|грудк\S* кури|chicken breast', r'^Chicken, broilers or fryers, breast, meat only, (raw|cooked, roasted|cooked, fried)$|^Chicken, broiler or fryers, breast, skinless, boneless, meat only, cooked, (braised|grilled)$'),
    (r'(кури|курин)\S* (бедр|голен|окорочк|ножк)|бедр\S* кури|chicken (thigh|leg|drumstick)', r'^Chicken, broilers or fryers, (thigh|drumstick), meat only, (raw|cooked, roasted)$|^Chicken, broilers or fryers, thigh, meat and skin, (raw|cooked, roasted)$'),
    (r'(кури|курин)\S* крыл|крыл\S* кури|chicken wing', r'^Chicken, broilers or fryers, wing, meat and skin, (raw|cooked, roasted|cooked, fried, flour)$'),
    (r'(кури|курин)\S* печен|chicken liver', r'^Chicken, liver, all classes, (raw|cooked, simmered|cooked, pan-fried)$'),
    (r'(кури|курин)\S* (сердц|желуд)', r'^Chicken, (heart|gizzard), all classes, (raw|cooked, simmered)$'),
    (r'индейк|индюш|turkey', r'^Turkey, whole, (breast|dark meat), meat only, (raw|cooked, roasted)$'),
    (r'утка\b|утки\b|утин|duck', r'^Duck, domesticated, meat only, (raw|cooked, roasted)$|^Duck, domesticated, meat and skin, cooked, roasted$'),
    (r'курица|куриц|курин|цыпл|chicken', r'^Chicken, broilers or fryers, meat only, (raw|roasted|stewed|fried)$|^Chicken, broilers or fryers, meat and skin, (raw|cooked, roasted)$'),
    # ——— meat ———
    (r'(говя|телят)\S* печен|печен\S* (говя|телят)|beef liver', r'^Beef, variety meats and by-products, liver, (raw|cooked, braised|cooked, pan-fried)$'),
    (r'печен\b|печени\b|печенк|liver', r'^Pork, fresh, variety meats and by-products, liver, (raw|cooked, braised)$|^Beef, variety meats and by-products, liver, (raw|cooked, braised)$'),
    (r'язык|tongue', r'^Beef, variety meats and by-products, tongue, (raw|cooked, simmered)$'),
    (r'сердц|heart', r'^Beef, variety meats and by-products, heart, (raw|cooked, simmered)$'),
    (r'фарш\S* (говя|из говя)|говяж\S* фарш|ground beef', r'^Beef, ground, (80|90|70)% lean meat / (20|10|30)% fat, (raw|patty, cooked, broiled|crumbles, cooked, pan-browned)$'),
    (r'фарш|ground (meat|pork)', r'^Pork, fresh, ground, (raw|cooked)$|^Beef, ground, 80% lean meat / 20% fat, (raw|patty, cooked, broiled)$'),
    (r'стейк|бифштекс|ростбиф|вырезк\S* говя|steak', r'^Beef, tenderloin, steak, separable lean only, trimmed to 1/8" fat, all grades, (raw|cooked, broiled)$|^Beef, rib eye steak, boneless, lip off, separable lean and fat, trimmed to 0" fat, all grades, (raw|cooked, grilled)$'),
    (r'говядин|говяж|телятин|beef|veal', r'^Beef, round, top round, separable lean only, trimmed to 1/8" fat, all grades, raw$|^Beef, chuck, arm pot roast, separable lean (only|and fat), trimmed to 1/8" fat, all grades, cooked, braised$|^Beef, bottom sirloin, tri-tip roast, separable lean and fat, trimmed to 0" fat, all grades, cooked, roasted$'),
    (r'свин\S* (вырезк|карбонад|корейк)|pork (loin|tenderloin)', r'^Pork, fresh, loin, tenderloin, separable lean only, (raw|cooked, roasted)$|^Pork, fresh, loin, whole, separable lean and fat, (raw|cooked, roasted)$'),
    (r'свинин|свиной|свиная|свиные|шашлык|pork', r'^Pork, fresh, (shoulder, whole|leg \(ham\), whole|loin, whole), separable lean and fat, (raw|cooked, roasted)$'),
    (r'баранин|ягнят|lamb|mutton', r'^Lamb, ground, (raw|cooked, broiled)$|^Lamb, Australian, imported, fresh, leg, shank half, separable lean and fat, trimmed to 1/8" fat, (raw|cooked, roasted)$'),
    (r'кролик|rabbit', r'^Game meat, rabbit, domesticated, composite of cuts, (raw|cooked, roasted|cooked, stewed)$'),
    (r'бекон|bacon', r'^Pork, cured, bacon, (unprepared|cooked, pan-fried)$'),
    (r'ветчин|буженин|ham\b', r'^Ham, sliced, regular \(approximately 11% fat\)$|^Pork, cured, ham, whole, separable lean and fat, roasted$'),
    (r'сосиск|сардельк|frankfurt|hot dog|wiener', r'^Frankfurter, (beef and pork|beef, unheated|pork)$'),
    (r'салями|сырокопч|сервелат|salami|pepperoni', r'^Salami, (dry or hard, pork, beef|cooked, beef and pork)$|^Pepperoni, beef and pork, sliced$'),
    (r'колбас|докторск|sausage|bologna', r'^Bologna, (beef and pork|pork)$|^Sausage, Italian, pork, cooked$|^Kielbasa'),
    (r'паштет|pate\b', r'^Pate, (chicken liver, canned|liver, not specified, canned)$|^Liverwurst spread$'),
    # ——— fish, seafood ———
    (r'лосос|семг|salmon', r'^Fish, salmon, Atlantic, farmed, (raw|cooked, dry heat)$|^Fish, salmon, chinook, smoked$|^Fish, salmon, pink, canned, without salt, solids with bone and liquid$'),
    (r'форел|trout', r'^Fish, trout, rainbow, farmed, (raw|cooked, dry heat)$'),
    (r'горбуш|кета\b|кеты\b|нерк|кижуч', r'^Fish, salmon, (pink|chum|sockeye|coho, wild), (raw|cooked, dry heat)$'),
    (r'скумбри|mackerel', r'^Fish, mackerel, Atlantic, (raw|cooked, dry heat)$|^Fish, mackerel, jack, canned, drained solids$'),
    (r'сельд|селед|herring', r'^Fish, herring, Atlantic, (raw|cooked, dry heat|pickled|kippered)$'),
    (r'сардин|шпрот|килька|sardine|sprat', r'^Fish, sardine, Atlantic, canned in oil, drained solids with bone$|^Fish, sardine, Pacific, canned in tomato sauce, drained solids with bone$'),
    (r'тунец|тунц|tuna', r'^Fish, tuna, light, canned in (water|oil), drained solids$|^Fish, tuna, fresh, yellowfin, (raw|cooked, dry heat)$'),
    (r'треск|cod\b', r'^Fish, cod, Atlantic, (raw|cooked, dry heat)$'),
    (r'минта|pollock', r'^Fish, pollock, Alaska, (raw|cooked)'),
    (r'хек\b|пикш|haddock|hake', r'^Fish, haddock, (raw|cooked, dry heat)$'),
    (r'судак|окун|щук|pike|perch', r'^Fish, (pike, walleye|perch, mixed species|pike, northern), (raw|cooked, dry heat)$'),
    (r'тилапи|tilapia', r'^Fish, tilapia, (raw|cooked, dry heat)$'),
    (r'камбал|палтус|flounder|halibut', r'^Fish, (flatfish \(flounder and sole species\)|halibut, Atlantic and Pacific), (raw|cooked, dry heat)$'),
    (r'карп|сазан|carp', r'^Fish, carp, (raw|cooked, dry heat)$'),
    (r'икра|caviar|roe\b', r'^Fish, caviar, black and red, granular$|^Fish, roe, mixed species, raw$'),
    (r'кревет|shrimp|prawn', r'^Crustaceans, shrimp, mixed species, (raw|cooked, moist heat)'),
    (r'кальмар|squid', r'^Mollusks, squid, mixed species, (raw|cooked, fried)$'),
    (r'мидии|мидий|mussel', r'^Mollusks, mussel, blue, (raw|cooked, moist heat)$'),
    (r'крабов\S* палоч|сурими|surimi', r'^Crustaceans, crab, alaska king, imitation, made from surimi$|^Fish, surimi$'),
    (r'краб|crab', r'^Crustaceans, crab, alaska king, (raw|cooked, moist heat)$'),
    (r'осьмин|octopus', r'^Mollusks, octopus, common, (raw|cooked, moist heat)$'),
    (r'рыб|fish', r'^Fish, (cod, Atlantic|pollock, Atlantic|carp), (raw|cooked, dry heat)$'),
    # ——— dairy ———
    (r'кокос\S* стружк|кокос|coconut', r'^Nuts, coconut meat, (raw|dried \(desiccated\), not sweetened)$'),
    (r'сгущ|condensed milk', r'^Milk, canned, condensed, sweetened$'),
    (r'сухо\S* молок|milk powder', r'^Milk, dry, (whole|nonfat, regular), without added vitamin'),
    (r'кефир|ряженк|простокваш|айран|варенец|kefir|buttermilk', r'^Milk, buttermilk, fluid, (cultured, lowfat|whole)$|^Kefir, lowfat, plain, LIFEWAY$'),
    (r'йогурт\S* греч|греческ\S* йогурт|greek yog|скир|skyr', r'^Yogurt, Greek, plain, (nonfat|lowfat|whole milk)$'),
    (r'йогурт|yogh?urt', r'^Yogurt, plain, (whole milk|low fat|skim milk)$|^Yogurt, fruit, low fat,? ?9 g(rams)? protein per 8 o'),
    (r'творожн\S* сыр|сыр творожн|сливочн\S* сыр|cream cheese|маскарпоне', r'^Cheese, cream$|^Cheese, cream, low fat$'),
    (r'творог|cottage|рикотт|ricotta|curd', r'^Cheese, cottage, (creamed, large or small curd|lowfat, 2% milkfat|nonfat, uncreamed, dry, large or small curd)$|^Cheese, ricotta, whole milk$'),
    (r'моцарел|mozzarell', r'^Cheese, mozzarella, (whole milk|part skim milk)$'),
    (r'пармезан|parmesan', r'^Cheese, parmesan, (hard|grated)$'),
    (r'фета\b|феты\b|брынз|feta', r'^Cheese, feta$'),
    (r'плавлен|processed cheese', r'^Cheese, pasteurized process, American, without added vitamin D$'),
    (r'сыр\b|сыра\b|чеддер|гауд|эдам|российск\S* сыр|cheese', r'^Cheese, (gouda|cheddar|edam|swiss)$'),
    (r'морожен|пломбир|ice cream', r'^Ice creams, (vanilla|chocolate|vanilla, rich)$'),
    (r'сметан|sour cream', r'^Cream, sour, (cultured|reduced fat, cultured)$'),
    (r'сливк|cream\b', r'^Cream, fluid, (half and half|light \(coffee cream or table cream\)|heavy whipping)$'),
    (r'сливочн\S* масл|масло сливоч|топлен\S* масл|butter\b|ghee', r'^Butter, without salt$|^Butter oil, anhydrous$'),
    (r'молок|milk', r'^Milk, (whole, 3.25% milkfat|reduced fat, fluid, 2% milkfat|lowfat, fluid, 1% milkfat|nonfat, fluid), without added vitamin A and vitamin D'),
    # ——— oils, sauces ———
    (r'оливков\S* масл|масло оливк|olive oil', r'^Oil, olive, salad or cooking$'),
    (r'льнян\S* масл', r'^Oil, flaxseed, cold pressed$'),
    (r'кокосов\S* масл|coconut oil', r'^Oil, coconut$'),
    (r'масл\S* (подсолн|растит|кукуруз|рапс)|подсолнечн\S* масл|растительн\S* масл|sunflower oil|vegetable oil|(^|[^a-z])oil\b', r'^Oil, sunflower, linoleic, \(approx. 65%\)$|^Oil, canola$'),
    (r'майонез|mayonnaise', r'^Salad dressing, mayonnaise, (regular|light)$'),
    (r'кетчуп|ketchup', r'^Catsup$'),
    (r'горчиц|mustard', r'^Mustard, prepared, yellow$'),
    (r'соев\S* соус|soy sauce', r'^Soy sauce made from soy and wheat \(shoyu\)$'),
    (r'томатн\S* паст|tomato paste', r'^Tomato products, canned, paste, without salt added'),
    (r'хумус|hummus', r'^Hummus, (commercial|home prepared)$'),
    (r'арахисов\S* паст|peanut butter', r'^Peanut butter, smooth style, without salt$'),
    (r'тахин|кунжутн\S* паст|tahini', r'^Seeds, sesame butter, tahini, from roasted and toasted kernels'),
    # ——— drinks ———
    (r'сок\S* апельсин|апельсинов\S* сок|orange juice', r'^Orange juice, chilled, includes from concentrate$'),
    (r'сок\S* яблоч|яблочн\S* сок|apple juice', r'^Apple juice, canned or bottled, unsweetened, without added ascorbic acid$'),
    (r'сок\S* томат|томатн\S* сок|tomato juice', r'^Tomato juice, canned, without salt added$'),
    (r'сок\S* (виноград|гранат|вишн|морков)|(виноградн|гранатов|вишнев|морковн)\S* сок', r'^(Grape juice, canned or bottled, unsweetened, without added ascorbic acid|Pomegranate juice, bottled|Carrot juice, canned)$'),
    (r'кола\b|cola|пепси|pepsi', r'^Beverages, carbonated, cola, regular$'),
    (r'пиво|beer', r'^Alcoholic beverage, beer, regular, all$'),
    (r'вино\b|вина\b|wine', r'^Alcoholic beverage, wine, table, (red|white)$'),
    (r'кофе|coffee|эспрессо|американо', r'^Beverages, coffee, brewed, prepared with tap water$'),
    (r'чай\b|чая\b|tea\b', r'^Beverages, tea, black, brewed, prepared with tap water$'),
    # ——— vegetables ———
    (r'картоф\S* фри|фри\b|french fries', r'^Potatoes, french fried, all types, salt (added|not added) in processing, frozen, (home-prepared, oven heated|as purchased)$|^Fast foods, potato, french fried in vegetable oil$'),
    (r'чипс|chips\b|crisps', r'^Snacks, potato chips, plain, salted$'),
    (r'пюре|mashed', r'^Potatoes, mashed, home-prepared, whole milk (and margarine )?added$'),
    (r'картоф|картош|potato', r'^Potatoes, (flesh and skin, raw|boiled, cooked without skin, flesh, without salt|baked, flesh and skin, without salt)$|^Potatoes, hash brown, home-prepared$'),
    (r'батат|sweet potato', r'^Sweet potato, (raw, unprepared|cooked, baked in skin, flesh, without salt)'),
    (r'помидор|томат|tomato', r'^Tomatoes, red, ripe, (raw, year round average|cooked|canned, packed in tomato juice)$|^Tomatoes, sun-dried$'),
    (r'огур\S* (солен|маринов)|солен\S* огур|маринован\S* огур|pickle', r'^Pickles, cucumber, (dill or kosher dill|sour)$'),
    (r'огур|cucumber', r'^Cucumber, with peel, raw$'),
    (r'перец болг|болгарск\S* перец|сладк\S* перец|bell pepper|паприк', r'^Peppers, sweet, (red|green), (raw|cooked, boiled, drained, without salt)$'),
    (r'морков|carrot', r'^Carrots, (raw|cooked, boiled, drained, without salt)$'),
    (r'квашен\S* капуст|капуст\S* квашен|sauerkraut', r'^Sauerkraut, canned, solids and liquids$'),
    (r'брокколи|broccoli', r'^Broccoli, (raw|cooked, boiled, drained, without salt)$'),
    (r'цветн\S* капуст|cauliflower', r'^Cauliflower, (raw|cooked, boiled, drained, without salt)$'),
    (r'брюссел|brussels', r'^Brussels sprouts, (raw|cooked, boiled, drained, without salt)$'),
    (r'пекинск\S* капуст|napa|chinese cabbage', r'^Cabbage, chinese \(pe-tsai\), raw$'),
    (r'морск\S* капуст|ламинари|kelp|seaweed', r'^Seaweed, kelp, raw$'),
    (r'капуст|cabbage', r'^Cabbage, (raw|cooked, boiled, drained, without salt)$|^Cabbage, red, raw$'),
    (r'кабач|цукини|zucchini', r'^Squash, summer, zucchini, includes skin, (raw|cooked, boiled, drained, without salt)$'),
    (r'баклажан|eggplant', r'^Eggplant, (raw|cooked, boiled, drained, without salt)$'),
    (r'тыкв|pumpkin', r'^Pumpkin, (raw|cooked, boiled, drained, without salt)$'),
    (r'свекл|beet', r'^Beets, (raw|cooked, boiled, drained)$'),
    (r'редис|radish', r'^Radishes, raw$'),
    (r'лук\S* зелен|зелен\S* лук|scallion', r'^Onions, spring or scallions \(includes tops and bulb\), raw$'),
    (r'лук\b|лука\b|onion', r'^Onions, (raw|cooked, boiled, drained, without salt)$'),
    (r'чеснок|garlic', r'^Garlic, raw$'),
    (r'кукуруз|corn\b', r'^Corn, sweet, yellow, (raw|canned, whole kernel, drained solids|cooked, boiled, drained, without salt)$'),
    (r'шпинат|spinach', r'^Spinach, (raw|cooked, boiled, drained, without salt)$'),
    (r'руккол|arugula', r'^Arugula, raw$'),
    (r'салат лист|листов\S* салат|айсберг|латук|романо|lettuce', r'^Lettuce, (green leaf|iceberg \(includes crisphead types\)|cos or romaine), raw$'),
    (r'петрушк|parsley', r'^Parsley, fresh$'),
    (r'укроп|dill', r'^Dill weed, fresh$'),
    (r'кинз|cilantro', r'^Coriander \(cilantro\) leaves, raw$'),
    (r'сельдер|celery', r'^Celery, raw$'),
    (r'спарж|asparagus', r'^Asparagus, (raw|cooked, boiled, drained)$'),
    (r'шампиньон|гриб|вешенк|mushroom', r'^Mushrooms, white, (raw|cooked, boiled, drained, without salt|stir-fried)$|^Mushrooms, oyster, raw$'),
    (r'авокадо|avocado', r'^Avocados, raw, all commercial varieties$'),
    (r'оливк|маслин|olive', r'^Olives, ripe, canned \(small-extra large\)$|^Olives, pickled, canned or bottled, green$'),
    (r'имбир|ginger', r'^Ginger root, raw$'),
    # ——— fruit, berries ———
    (r'яблок|apple', r'^Apples, raw, with skin'),
    (r'банан|banana', r'^Bananas, raw$'),
    (r'апельсин|orange', r'^Oranges, raw, all commercial varieties$'),
    (r'мандарин|tangerine|clementine', r'^Tangerines, \(mandarin oranges\), raw$'),
    (r'грейпфрут|помело|grapefruit', r'^Grapefruit, raw, pink and red, all areas$'),
    (r'лимон|lemon', r'^Lemons, raw, without peel$'),
    (r'груш|pear\b', r'^Pears, raw$'),
    (r'виноград|grape', r'^Grapes, red or green \(European type, such as Thompson seedless\), raw$'),
    (r'персик|нектарин|peach', r'^Peaches, yellow, raw$'),
    (r'кураг|dried apricot', r'^Apricots, dried, sulfured, uncooked$'),
    (r'абрикос|apricot', r'^Apricots, raw$'),
    (r'чернослив|prune', r'^Plums, dried \(prunes\), uncooked$'),
    (r'слива\b|сливы\b|plum', r'^Plums, raw$'),
    (r'ананас|pineapple', r'^Pineapple, raw, all varieties$'),
    (r'манго|mango', r'^Mangos, raw$'),
    (r'арбуз|watermelon', r'^Watermelon, raw$'),
    (r'дыня|дыни|melon', r'^Melons, cantaloupe, raw$'),
    (r'киви|kiwi', r'^Kiwifruit, green, raw$'),
    (r'хурм|persimmon', r'^Persimmons, japanese, raw$'),
    (r'гранат|pomegranate', r'^Pomegranates, raw$'),
    (r'инжир|fig\b', r'^Figs, (raw|dried, uncooked)$'),
    (r'финик|dates\b', r'^Dates, (deglet noor|medjool)$'),
    (r'изюм|raisin', r'^Raisins, dark, seedless'),
    (r'клубник|земляник|strawberr', r'^Strawberries, raw$'),
    (r'малин|raspberr', r'^Raspberries, raw$'),
    (r'черник|голубик|blueberr', r'^Blueberries, raw$'),
    (r'ежевик|blackberr', r'^Blackberries, raw$'),
    (r'смородин|currant', r'^Currants, european black, raw$|^Currants, red and white, raw$'),
    (r'клюкв|брусник|cranberr', r'^Cranberries, raw$'),
    (r'вишн|черешн|cherr', r'^Cherries, (sweet|sour, red), raw$'),
    # ——— nuts, seeds ———
    (r'грецк|walnut', r'^Nuts, walnuts, english$'),
    (r'миндал|almond', r'^Nuts, almonds$'),
    (r'арахис|peanut', r'^Peanuts, all types, (raw|dry-roasted, without salt)$'),
    (r'кешью|cashew', r'^Nuts, cashew nuts, raw$'),
    (r'фундук|лесн\S* орех|hazelnut', r'^Nuts, hazelnuts or filberts$'),
    (r'фисташ|pistachio', r'^Nuts, pistachio nuts, raw$'),
    (r'кедров|pine nut', r'^Nuts, pine nuts, dried$'),
    (r'семечк|семена подсолн|sunflower seed', r'^Seeds, sunflower seed kernels, dried$'),
    (r'тыквенн\S* сем|pumpkin seed', r'^Seeds, pumpkin and squash seed kernels, dried$'),
    (r'кунжут|sesame', r'^Seeds, sesame seeds, whole, dried$'),
    (r'чиа\b|chia', r'^Seeds, chia seeds, dried$'),
    (r'сем\S* льна|льнян\S* сем|flaxseed', r'^Seeds, flaxseed$'),
    # ——— sweets, bakery ———
    (r'шоколад\S* (горьк|темн|черн)|(горьк|темн|черн)\S* шоколад|dark chocolate', r'^Chocolate, dark, (70-85|60-69|45- 59)% cacao solids$'),
    (r'шоколад|chocolate', r'^Candies, milk chocolate$'),
    (r'какао|cocoa', r'^Cocoa, dry powder, unsweetened$'),
    (r'мед\b|меда\b|honey', r'^Honey$'),
    (r'сахар|sugar', r'^Sugars, granulated$'),
    (r'варень|джем|повидл|jam\b', r'^Jams and preserves$'),
    (r'халв|halva', r'^Candies, halavah, plain$'),
    (r'зефир|пастил|маршмел|marshmallow', r'^Candies, marshmallows$'),
    (r'мармелад|gummy|jelly candy', r'^Candies, (gumdrops, starch jelly pieces|jellybeans)$'),
    (r'печенье овсян|овсян\S* печень|oatmeal cookie', r'^Cookies, oatmeal, commercially prepared, regular$'),
    (r'печень|cookie|biscuit', r'^Cookies, (butter, commercially prepared, unenriched|sugar, commercially prepared, regular \(includes vanilla\))$'),
    (r'круассан|croissant', r'^Croissants, butter$'),
    (r'пончик|donut|doughnut', r'^Doughnuts, yeast-leavened, glazed, unenriched'),
    (r'вафл|wafer|waffle', r'^Cookies, (vanilla wafers, lower fat|sugar wafers with creme filling, regular)$'),
    (r'крекер|cracker', r'^Crackers, (saltines \(includes oyster, soda, soup\)|standard snack-type, regular)$'),
    (r'попкорн|popcorn', r'^Snacks, popcorn, (air-popped|oil-popped, microwave, regular flavor, no trans fat)$'),
    (r'мюсли|гранол|granola|muesli', r'^Cereals ready-to-eat, granola, homemade$|^Cereals ready-to-eat, MUESLI, dried fruit and nuts$'),
]


def read(name):
    with open(f'{SRC}/{name}', encoding='utf-8') as f:
        yield from csv.DictReader(f)


nutr_id = {r['name']: r['id'] for r in read('nutrient.csv')}
want = {nutr_id[n]: k for k, n in {**NUTRIENTS, **MACROS}.items()}
foods = {r['fdc_id']: r['description'] for r in read('food.csv')}
values = {}
for r in read('food_nutrient.csv'):
    k = want.get(r['nutrient_id'])
    if k:
        values.setdefault(r['fdc_id'], {})[k] = float(r['amount'])

out = []
missing = 0
for item in ITEMS:
    name_re, usda_re = item[0], item[1]
    exclude = item[2] if len(item) > 2 else None
    ids = [i for i, d in foods.items() if re.search(usda_re, d) and not (exclude and re.search(exclude, d))]
    ids = [i for i in ids if 'protein' in values.get(i, {})]
    # the same macros twice (enriched / not) add nothing; raw and boiled vegetables stay apart: their vitamins differ
    variants = []
    # raw first: when two variants have the same macros, the raw one is kept
    for i in sorted(ids, key=lambda i: ('raw' not in foods[i].lower(), foods[i])):
        v = values[i]
        row = [round(v.get(c, 0.0), 3 if c in NUTRIENTS else 2) for c in COLUMNS]
        if any(abs(row[0] - x[0]) + abs(row[1] - x[1]) + abs(row[2] - x[2]) < 0.3 for x in variants):
            continue
        variants.append(row)
    if not variants:
        missing += 1
        print(f'!! no USDA food for {name_re!r}: {usda_re[:70]}')
        continue
    out.append({'re': name_re, 'v': variants[:MAX_VARIANTS]})
    if '-v' in sys.argv:
        print(f'{name_re[:34]:34} {len(variants)}  ' + ' | '.join(foods[i][:38] for i in sorted(ids, key=lambda i: foods[i])[:4]))

with open(OUT, 'w', encoding='utf-8') as f:
    f.write('// GENERATED by tools/make_micro_foods.py from USDA FoodData Central SR Legacy (public domain).\n')
    f.write('// Specific foods: a name pattern and its variants (raw, cooked…). Each variant is a row of numbers per 100 g\n')
    f.write('// in the order of MICRO_FOOD_COLUMNS. The app takes the variant closest to the entered protein / fat / carbs.\n')
    f.write('/* eslint-disable */\n')
    f.write(f'export const MICRO_FOOD_COLUMNS = {json.dumps(COLUMNS)} as const;\n')
    f.write('export const MICRO_FOODS: { re: string; v: number[][] }[] = [\n')
    for o in out:
        f.write(' ' + json.dumps(o, ensure_ascii=False, separators=(',', ':')) + ',\n')
    f.write('];\n')
print(f'wrote {OUT}: {len(out)} foods, {sum(len(o["v"]) for o in out)} variants, {missing} patterns without a match')
