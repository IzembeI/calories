"""Build app/src/data/micro-ref.ts from the USDA FoodData Central SR Legacy CSV (public domain).

Usage: python -I tools/make_micro_ref.py <path-to-sr_legacy_csv-dir> app/src/data/micro-ref.ts

For each food category it averages the USDA foods whose description matches the category's
pattern. Vitamins and minerals are stored per 100 g. Sugars and fiber are stored as a share of
carbohydrates, saturated fat as a share of fat, so an estimate scales with the user's own KBJU.
"""
import csv
import json
import re
import sys
from collections import defaultdict

SRC, OUT = sys.argv[1], sys.argv[2]

# key -> (USDA nutrient name, unit in the app)
NUTRIENTS = {
    'vit_a': ('Vitamin A, RAE', 'µg'),
    'vit_c': ('Vitamin C, total ascorbic acid', 'mg'),
    'vit_d': ('Vitamin D (D2 + D3)', 'µg'),
    'vit_e': ('Vitamin E (alpha-tocopherol)', 'mg'),
    'vit_k': ('Vitamin K (phylloquinone)', 'µg'),
    'b1': ('Thiamin', 'mg'),
    'b2': ('Riboflavin', 'mg'),
    'b3': ('Niacin', 'mg'),
    'b6': ('Vitamin B-6', 'mg'),
    'b9': ('Folate, DFE', 'µg'),
    'b12': ('Vitamin B-12', 'µg'),
    'ca': ('Calcium, Ca', 'mg'),
    'fe': ('Iron, Fe', 'mg'),
    'mg': ('Magnesium, Mg', 'mg'),
    'p': ('Phosphorus, P', 'mg'),
    'k': ('Potassium, K', 'mg'),
    'na': ('Sodium, Na', 'mg'),
    'zn': ('Zinc, Zn', 'mg'),
    'se': ('Selenium, Se', 'µg'),
    'chol': ('Cholesterol', 'mg'),
}
EXTRA = {'carb': 'Carbohydrate, by difference', 'fat': 'Total lipid (fat)', 'sugar': 'Sugars, Total',
         'fiber': 'Fiber, total dietary', 'satfat': 'Fatty acids, total saturated'}

# key: (title, include regex, exclude regex or None, added-sugar share of total sugars)
CATEGORIES = {
    'grains_cooked': ('Крупы и каши', r'^(Rice, (white|brown)|Buckwheat groats|Bulgur|Quinoa|Barley, pearled|Millet|Cereals, oats).*cooked', r'with salt|fortified|instant', 0),
    'grains_dry': ('Крупы сухие, мука', r'^(Rice, (white|brown).*raw|Buckwheat groats, roasted, dry|Bulgur, dry|Quinoa, uncooked|Millet, raw|Oats$|Oats, regular|Wheat flour)', r'enriched, bleached', 0),
    'pasta': ('Макароны', r'^(Pasta|Macaroni|Spaghetti), .*(cooked|dry)', r'gluten-free|spinach|vegetable|homemade|corn', 0),
    'legumes': ('Бобовые', r'^(Lentils|Chickpeas|Beans, (kidney|black|navy|pinto)|Peas, split).*(boiled|cooked)', r'with salt', 0),
    'bread': ('Хлеб', r'^Bread, (white|wheat|rye|whole-wheat|pita|french)', r'toasted|reduced', 0.3),
    'bakery': ('Выпечка, блины', r'^(Croissants|Cookies, oatmeal|Pancakes, plain|Cake, (sponge|yellow)|Doughnuts, cake|Crackers)', None, 0.8),
    'potato': ('Картофель', r'^Potatoes, (boiled|baked|mashed)|^Potatoes, french fried', r'dehydrated|frozen, unprepared', 0),
    'red_meat': ('Говядина, свинина', r'^(Beef|Pork), .*(cooked|roasted|braised|broiled)', r'variety meats|fat only|imported|cured', 0),
    'poultry': ('Курица, индейка', r'^(Chicken|Turkey), .*meat only.*(cooked|roasted|stewed)', r'giblets|skin only|canned', 0),
    'processed_meat': ('Колбасы, сосиски', r'^(Sausage|Frankfurter|Bologna|Ham, sliced|Bacon|Salami)', None, 0.5),
    'liver': ('Печень, субпродукты', r'^(Beef, variety meats and by-products, liver|Chicken, liver|Pork, fresh, variety meats and by-products, liver).*(cooked|braised|fried|simmered)', None, 0),
    'fatty_fish': ('Жирная рыба', r'^Fish, (salmon|mackerel|herring|trout|sardine)', r'roe|raw|liver|Alaska Native|oil', 0),
    'lean_fish': ('Нежирная рыба', r'^Fish, (cod|pollock|tuna|haddock|pike|tilapia|whiting|perch)', r'raw|roe|liver|Alaska Native|oil', 0),
    'seafood': ('Морепродукты', r'^(Crustaceans|Mollusks), .*cooked|^Surimi', None, 0),
    'eggs': ('Яйца', r'^Egg, (whole|white)', r'dried|frozen', 0),
    'milk': ('Молоко, кефир, йогурт', r'^(Milk, (reduced fat|lowfat|whole|nonfat).*fluid|Yogurt, (plain|Greek, plain)|Kefir)', r'added vitamin A|protein fortified', 0),
    'sweet_dairy': ('Сладкие молочные', r'^(Yogurt, fruit|Milk, chocolate|Ice creams)', None, 0.7),
    'cottage_cheese': ('Творог', r'^Cheese, cottage', None, 0),
    'cheese': ('Сыр', r'^Cheese, (cheddar|gouda|mozzarella|swiss|edam|parmesan|feta|provolone|cream)', r'low|substitute|imitation', 0),
    'cream': ('Сметана, сливки', r'^Cream, (sour|fluid)', r'reduced|imitation', 0),
    'butter': ('Сливочное масло', r'^Butter, (salted|without salt)', None, 0),
    'oils': ('Растительные масла', r'^Oil, (olive|sunflower|canola|corn|soybean)', r'hydrogenated', 0),
    'sauces': ('Соусы', r'^(Salad dressing, mayonnaise|Catsup|Soy sauce|Mustard, prepared|Hummus)', r'light|fat-free', 0.6),
    'leafy': ('Зелень, листовые', r'^(Spinach|Lettuce|Arugula|Kale|Parsley|Dill weed|Chard), (raw|fresh)', None, 0),
    'vegetables': ('Овощи', r'^(Cucumber|Tomatoes, red, ripe, raw|Peppers, sweet|Carrots|Cabbage|Broccoli|Cauliflower|Squash, summer|Eggplant|Onions|Beets|Peas, green|Corn, sweet)', r'frozen|dehydrated|pickled', 0),
    'pickles': ('Соленья, квашеное', r'^(Pickles|Sauerkraut)', None, 0),
    'mushrooms': ('Грибы', r'^Mushrooms, (white|brown|oyster|shiitake)', r'dried|canned', 0),
    'avocado_olives': ('Авокадо, оливки', r'^(Avocados, raw|Olives, ripe|Olives, pickled)', None, 0),
    'citrus': ('Цитрусовые', r'^(Oranges, raw|Tangerines|Grapefruit, raw|Lemons, raw|Limes, raw)', None, 0),
    'fruits': ('Фрукты', r'^(Apples, raw|Bananas, raw|Pears, raw|Grapes|Peaches, yellow, raw|Apricots, raw|Plums, raw|Pineapple, raw|Mangos, raw|Melons|Watermelon, raw|Kiwifruit|Persimmons)', None, 0),
    'berries': ('Ягоды', r'^(Strawberries, raw|Raspberries, raw|Blueberries, raw|Blackberries, raw|Cranberries, raw|Currants)', None, 0),
    'dried_fruit': ('Сухофрукты', r'^(Dates|Apricots, dried|Raisins|Plums, dried|Figs, dried)', r'stewed|cooked', 0),
    'nuts_seeds': ('Орехи и семечки', r'^(Nuts, (almonds|walnuts|cashew|hazelnuts|pistachio)|Peanuts, all types|Seeds, (sunflower|chia|pumpkin|flaxseed)|Peanut butter)', r'oil-roasted|with salt|reduced', 0.05),
    'sweets': ('Сладости, сахар', r'^(Candies, (milk chocolate|semisweet|dark chocolate|marshmallows|halavah)|Sugars, granulated|Honey|Jams and preserves|Cookies, chocolate)', None, 0.95),
    'sweet_drinks': ('Сладкие напитки, соки', r'^(Beverages, carbonated, cola|Orange juice, raw|Apple juice|Beverages, cranberry)', r'diet|without|added ascorbic|vitamin C|calcium', 0.5),
    'drinks': ('Чай, кофе, вода', r'^(Beverages, (coffee|tea), .*brewed|Beverages, water)', r'decaf', 0),
    'alcohol': ('Алкоголь', r'^Alcoholic beverage, (beer|wine)', None, 0),
    'mixed_dish': ('Готовые блюда, супы', r'^(Soup, .*ready-to-serve|Pizza|Fast foods, (hamburger|burrito|cheeseburger)|Lasagna|Spaghetti)', r'dry|condensed', 0.2),
}

def read(name):
    with open(f'{SRC}/{name}', encoding='utf-8') as f:
        yield from csv.DictReader(f)

nutr_id = {}
for r in read('nutrient.csv'):
    nutr_id[r['name']] = r['id']
want = {k: nutr_id[n] for k, (n, _) in NUTRIENTS.items()}
want.update({k: nutr_id[n] for k, n in EXTRA.items()})
id_to_key = {v: k for k, v in want.items()}

foods = {r['fdc_id']: r['description'] for r in read('food.csv')}
members = defaultdict(list)
for fid, desc in foods.items():
    for cat, (_, inc, exc, _) in CATEGORIES.items():
        if re.search(inc, desc, re.I) and not (exc and re.search(exc, desc, re.I)):
            members[cat].append(fid)
            break
needed = {fid for ids in members.values() for fid in ids}

values = defaultdict(dict)
for r in read('food_nutrient.csv'):
    if r['fdc_id'] in needed and r['nutrient_id'] in id_to_key:
        values[r['fdc_id']][id_to_key[r['nutrient_id']]] = float(r['amount'])

def mean(xs):
    xs = [x for x in xs if x is not None]
    return sum(xs) / len(xs) if xs else 0.0

out = {}
for cat, (title, _, _, added_share) in CATEGORIES.items():
    ids = members[cat]
    if not ids:
        print(f'!! no USDA foods matched {cat}')
        continue
    v = [values[i] for i in ids]
    rec = {k: round(mean([x.get(k) for x in v]), 3) for k in NUTRIENTS}
    carb = mean([x.get('carb') for x in v]); fat = mean([x.get('fat') for x in v])
    sugar = mean([x.get('sugar') for x in v]); fiber = mean([x.get('fiber') for x in v]); sat = mean([x.get('satfat') for x in v])
    rec['sugar_per_carb'] = round(min(sugar / carb, 1), 3) if carb > 0.5 else 0
    rec['fiber_per_carb'] = round(min(fiber / carb, 1), 3) if carb > 0.5 else 0
    rec['sat_per_fat'] = round(min(sat / fat, 1), 3) if fat > 0.3 else 0
    rec['added_share'] = added_share
    out[cat] = {'title': title, 'n': len(ids), 'per100': rec}
    print(f'{cat:16} {len(ids):4} foods  e.g. {foods[ids[0]][:60]}')

units = {k: u for k, (_, u) in NUTRIENTS.items()}
with open(OUT, 'w', encoding='utf-8') as f:
    f.write('// GENERATED by tools/make_micro_ref.py from USDA FoodData Central SR Legacy (public domain).\n')
    f.write('// Per category: vitamins/minerals per 100 g; sugar and fiber as a share of carbs; saturated fat as a share of fat.\n')
    f.write('/* eslint-disable */\n')
    f.write(f'export const MICRO_UNITS = {json.dumps(units, ensure_ascii=False)} as const;\n')
    f.write(f'export const MICRO_REF = {json.dumps(out, ensure_ascii=False, indent=1)} as const;\n')
    f.write('export type CategoryKey = keyof typeof MICRO_REF;\n')
print('wrote', OUT)
