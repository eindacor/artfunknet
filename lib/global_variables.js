min_frame_width_cm = 3;
max_frame_width_cm = 16;
min_matte_width_cm = 0;
max_matte_width_cm = 20;

display_level_coefficient = 1.07;
xp_level_coefficient = 1.05;

DEBUG = false;
TEST_MODE = false;

knowledge_types = ['historical_data', 'contextual_understanding', 'technical_comprehension', 'artistic_vision'];
crate_qualities = ["bronze", "silver", "gold", "platinum", "diamond"];
artwork_rarities = ["common", "uncommon", "rare", "legendary", "masterpiece"];
CARD_TYPES = ["foil", "unlocked", "seasonal"];
ARCHIVE_CATEGORIES = ["standard", "foil", "unlocked", "seasonal", "vintage", "lottery"];
VISITOR_QUALITIES = ["bronze", "silver", "gold", "platinum"];

MAX_ITEM_LEVEL = 10;

KNOWLEDGE_BASE = 15;
KNOWLEDGE_CONVERSION_BASE = 16;
KNOWLEDGE_UNIT = 4;

STARTING_BALANCE = 100000;

MARKETING_PROC_BOOST = .1;
BASE_NPC_PROC_MAX = 1 - MARKETING_PROC_BOOST;

PLAYER_LEVEL_MAX = 50;
OWN_GALLERY_NPC_AMPLIFIER = 1.75;

CRATE_UPCHARGE_COEFFICIENT = 4;

FOIL_VALUE_BUFF = 5;
UNLOCKED_VALUE_BUFF = 1.5;
SEASONAL_VALUE_BUFF = 10;
BASE_LOTTERY_VALUE_BUFF = 10;
LOTTERY_LEVEL_VALUE_BUFF = 1;
VINTAGE_VALUE_BUFF = 2;
ORIGINAL_VALUE_BUFF = 7;
ITEM_LEVEL_VALUE_BUFF = .01;

DYNAMIC_CRATE_DISCOUNT_COEFFICIENT = .95;
DYNAMIC_CRATE_COUNT = 4;
DYNAMIC_CRATE_PURCHASE_LIMIT = 5;

REPAIRING_IMPROVEMENT_VALUE = .10;

IDENTIFY_FORGED_AUCTIONS_PROC = .2;

BOT_USER_NAME = "Artfunkel, Inc.";

CATEGORY_QUERIES = {
	'standard': {
		'foil': false,
		'unlocked': false,
		'lottery': 0,
		'seasonal': false,
		'vintage': false,
		'original': false
	},
	'foil': {'foil': true},
	'unlocked': {'unlocked': true},
	'seasonal': {'seasonal': true},
	'lottery': {'lottery': {'$ne': 0}},
	'vintage': {'vintage': true},
	'original': {'original': true}
};

INVERSE_CATEGORY_QUERIES = {
	'standard': {
		'$or': [{'foil': true},
				{'unlocked': true},
				{'lottery': {'$ne': 0}},
				{'seasonal': true},
				{'vintage': true},
				{'original': true}]
	},
	'foil': {'foil': false},
	'unlocked': {'unlocked': false},
	'seasonal': {'seasonal': false},
	'lottery': {'lottery': 0},
	'vintage': {'vintage': false},
	'original': {'original': false}
};

REROLL_COEFFICIENTS = {
    'common' : 1.1,
    'uncommon' : 1.11,
    'rare' : 1.12,
    'legendary' : 1.13,
    'masterpiece' : 1.14
}

DEFAULT_ATTRIBUTE_MAP = {};

var all_attributes = attributes.find({'active': true}).fetch();

for (var i=0; i<all_attributes.length; i++) {
	var attribute_object = all_attributes[i];
	DEFAULT_ATTRIBUTE_MAP[attribute_object._id] = 1;
}

FORGERY_DETECTION_CHANCE = .1;
IDENTIFY_COST_COEFFICIENT = .2;
FORGERY_COST_COEFFICIENT = .8;
FORGERY_REDEMPTION_BONUS_COEFFICIENT = .2;

FORGERY_HEAT_CATEGORY = {
    'QUEST': "quest",
    'SELL': "sell",
    'DONATE': "donate",
    'COLLECTOR': "collector",
    'DISPLAY': "display"
}

//sum total must equal 1
FORGERY_TYPE_HEAT_COEFFICIENTS = {
    'RARITY': .8,
    'FOIL': .3,
    'UNLOCKED': .1,
    'SEASONAL': .3,
    'VINTAGE': .3,
    'LOTTERY': .6,
    'LEVEL': .2
}

GENERATED_AUCTION_FORGERY_CHANCE = DEBUG ? 1 : .001;

TUTORIAL_PLAYER_IDS = ["itvzXwRNg9GykzmxK"];