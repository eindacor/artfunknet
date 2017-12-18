var drop_count = 6;
var drop_frequency = 10800000; //once every 3 hours

dailyDropIsEnabled = function() {
	if (Meteor.user()) {
		var last_drop = Meteor.user().profile.last_drop;
		return (moment() - moment(last_drop) > drop_frequency);
	}

	else return false;
}

PERMISSION_RESPONSES = {
	IS_REPAIRING: 'this item is currently being repaired',
	IS_ALREADY_ON_DISPLAY: "an item of this artwork is already on display",
	DISPLAY_LIMIT_MET: "you have reached the limit of items on display",
	NOT_OWNED: "you do not own this item",
	NOT_CLAIMED: "this item is not in your inventory",
	NOT_DISPLAYED: "this item is not currently on display",
	IS_PERMANENT: "this item is part of your permanent collection",
	NOT_PERMANENT: "this item is not part of your permanent collection",
	AUCTION_LIMIT_MET: "you have reached your auction limit",
	NOT_ELIGIBLE_FOR_PERMANENT: "this item is inelligible for your permanent collection",
	IS_DISPLACED: "this item is currently displaced in your archive",
	PERMANENT_LIMIT_MET: "you have reached your limit for items in your permanent collection",
	NOT_REPAIRING: "this item is not currently being repaired",
	NOT_ELIGIBLE_FOR_REPAIRING: "this item is inelligible for repairing",
	REPAIRING_LIMIT_MET: "you have reached your limit for items being repaired",
	IS_DISPLAYED: "this item is currently on display",
	INSUFFICIENT_FUNDS: "you have insufficient funds for this action",
	LOCKED_ATTRIBUTE: "this attribute cannot be modified",
	ORIGINAL_ITEM: "this is an original item",
	NOT_ELIGIBLE_FOR_SELLING: "this item cannot currently be sold",
	NOT_ELIGIBLE_FOR_CLAIMING: "this item cannot currently be claimed",
	FULL_INVENTORY: "your inventory is currently full",
	NOT_ELIGIBLE_FOR_DECLINING: "this item cannot currently be declined",
	NOT_ELIGIBLE_FOR_PURCHASING: "this item cannot currently be purchased",
	IS_FOR_SALE: "this item is currently for sale",
	NOT_FOR_SALE: "this item is not currently for sale",
	NOT_ELIGIBLE_FOR_TAGGING_FOR_SALE: "this item cannot currently be tagged for sale",
	INACTIVE_PLAYER: "invalid action",
	IDENTIFIED_FORGERY: "this item is an identified forgery",
	QUICK_DISCARD_OPTIONS: "your quick-discard settings prevent this action",
	INSUFFICIENT_PLAYER_LEVEL: "your player level is insufficient",
	NOT_ELIGIBLE_FOR_DONATING: "this item cannot currently be donated",
	INSUFFICIENT_KNOWLEDGE: "you have insufficient knowledge",
	NOT_ELIGIBLE_FOR_ARCHIVING: "this item cannot currently be archived",
	NOT_ELIGIBLE_FOR_DELETING: "this item cannot currently be deleted",
	NOT_ELIGIBLE_FOR_FORGING: "this item cannot currently be forged",
	LIABLE: "you are liable for this item's forgery status",
	NOT_FORGERY: "this item is not a forgery",
	IS_PATREON: "this action is restricted for patreon items"
}

PlayerItemPermissions = function(player_interface, item_interface) {
	var user_object = player_interface.getUserObject();
	var item_object = item_interface.getItemObject();

	var negativeResponse = function(reason) {
		if (reason === undefined) {
			throw "negative responses require a reason";
		}

		return {
			'result': false,
			'reason': reason
		}
	}

	POSITIVE_RESPONSE = {
		'result': true,
		'reason': undefined
	}

	var isOwned = function() {
		return player_interface.isActive() && item_interface.getOwnerId() == user_object._id;
	}

	var isClaimed = function() {
		return item_interface.getStatus() == "claimed";
	}

	var isOwnedAndClaimed = function() {
		return isOwned() && isClaimed();
	}

	this.getItemIF = function() {
		return item_interface;
	}

	this.getUserObject = function() {
		return user_object;
	}

	var artworkIsAlreadyPermanentOrDisplayed = function() {
		return getOneFromCollection("PlayerItemPermissions.js:PlayerItemPermissions.artworkIsAlreadyPermanentOrDisplayed()", items, {'owner': user_object._id, $or: [{'permanent': true}, {'status': "displayed"}], 'artwork_id': item_object.artwork_id}) != undefined;
	}

	this.canDisplay = function() {
		if (!isOwned()) {
			return negativeResponse(PERMISSION_RESPONSES.NOT_OWNED);
		}

		if (!isClaimed()) {
			return negativeResponse(PERMISSION_RESPONSES.NOT_CLAIMED);
		}

		if (item_interface.isRepairing()) {
			return negativeResponse(PERMISSION_RESPONSES.IS_REPAIRING);
		}

		if (artworkIsAlreadyPermanentOrDisplayed()) {
			return negativeResponse(PERMISSION_RESPONSES.IS_ALREADY_ON_DISPLAY)
		}

		if (getFromCollection("PlayerItemPermissions.js:PlayerItemPermissions.canDisplay()", items, {'owner' : user_object._id, 'status' : "displayed"}).count() >= user_object.profile.display_cap) {
			return negativeResponse(PERMISSION_RESPONSES.DISPLAY_LIMIT_MET);
		}

		return POSITIVE_RESPONSE;
	}

	this.canUndisplay = function() {
		if (!isOwned()) {
			return negativeResponse(PERMISSION_RESPONSES.NOT_OWNED);
		}

		if (item_interface.getStatus() != "displayed") {
			return negativeResponse(PERMISSION_RESPONSES.NOT_DISPLAYED);
		}

		return POSITIVE_RESPONSE;
	}

	this.canAuction = function() {
		if (item_interface.isPermanent()) {
			return negativeResponse(PERMISSION_RESPONSES.IS_PERMANENT);
		}

		if (!isOwned()) {
			return negativeResponse(PERMISSION_RESPONSES.NOT_OWNED);
		}

		if (!isClaimed()) {
			return negativeResponse(PERMISSION_RESPONSES.NOT_CLAIMED);
		}

		if (item_interface.isRepairing()) {
			return negativeResponse(PERMISSION_RESPONSES.IS_REPAIRING)
		}

		var has_auctioneer = user_object.profile.market_expert.expiration > moment()._d.toISOString();
		var auction_limit = Math.floor(user_object.profile.auction_cap * (has_auctioneer ? 1.5 : 1));

		if (getFromCollection("PlayerItemPermissions.js:PlayerItemPermissions.canAuction()", items, {'owner' : user_object._id, 'status' : "auctioned"}).count() >= auction_limit) {
			return negativeResponse(PERMISSION_RESPONSES.AUCTION_LIMIT_MET);
		}

		return POSITIVE_RESPONSE;
	}

	this.canSetPermanent = function() {
		if (!isOwned()) {
			return negativeResponse(PERMISSION_RESPONSES.NOT_OWNED);
		}

		if (item_interface.isPermanent()) {
			return negativeResponse(PERMISSION_RESPONSES.IS_PERMANENT);
		}

		if (artworkIsAlreadyPermanentOrDisplayed()) {
			return negativeResponse(PERMISSION_RESPONSES.IS_ALREADY_ON_DISPLAY)
		}

		if (["unclaimed", "won", "for_sale"].indexOf(item_interface.getStatus()) != -1) {
			return negativeResponse(PERMISSION_RESPONSES.NOT_ELIGIBLE_FOR_PERMANENT)
		}

		if (item_interface.isDisplaced()) {
			return negativeResponse(PERMISSION_RESPONSES.IS_DISPLACED);
		}

		if (getFromCollection("PlayerItemPermissions.js:PlayerItemPermissions.canSetPermanent()", items, {'owner':  player_interface.getId(),'permanent': true}).count() >= user_object.profile.pc_cap) {
			return negativeResponse(PERMISSION_RESPONSES.PERMANENT_LIMIT_MET);
		}

		return POSITIVE_RESPONSE;
	}

	this.canUnsetPermanent = function() {
		if (!isOwned()) {
			return negativeResponse(PERMISSION_RESPONSES.NOT_OWNED);
		}

		if (!item_interface.isPermanent()) {
			return negativeResponse(PERMISSION_RESPONSES.NOT_PERMANENT);
		}
		
		return POSITIVE_RESPONSE;
	}

	this.canSetRepairing = function() {
		if (!isOwned()) {
			return negativeResponse(PERMISSION_RESPONSES.NOT_OWNED);
		}

		if (item_interface.isRepairing()) {
			return negativeResponse(PERMISSION_RESPONSES.IS_REPAIRING)
		}

		if (["displayed", "auctioned", "archived"].indexOf(item_interface.getStatus()) != -1) {
			return negativeResponse(PERMISSION_RESPONSES.NOT_ELIGIBLE_FOR_REPAIRING)
		}

		if (getFromCollection("PlayerItemPermissions.js:PlayerItemPermissions.canSetRepairing()", items, {'owner' : user_object._id, 'repairing' : true}).count() >= user_object.profile.repairing_cap) {
			return negativeResponse(PERMISSION_RESPONSES.REPAIRING_LIMIT_MET)
		}

		return POSITIVE_RESPONSE;
	}

	this.canUnsetRepairing = function() {
		if (!isOwned()) {
			return negativeResponse(PERMISSION_RESPONSES.NOT_OWNED);
		}

		if (!item_interface.isRepairing()) {
			return negativeResponse(PERMISSION_RESPONSES.NOT_REPAIRING);
		}

		return POSITIVE_RESPONSE;
	}

	var rerollIsEnabled = function() {
		if (!isOwned()) {
			return negativeResponse(PERMISSION_RESPONSES.NOT_OWNED);
		}

		var status = item_interface.getStatus();

		if (status == "claimed") {
			return POSITIVE_RESPONSE;
		}

		if (status == "displayed") {
			if (player_interface.procUniqueAttribute("REROLL_DISPLAY_ENABLE", "Marketing Manager")) {
				return POSITIVE_RESPONSE;
			}
			else return negativeResponse(PERMISSION_RESPONSES.IS_DISPLAYED)
		}

		return POSITIVE_RESPONSE;
	}

	this.canReroll = function() {
		var reroll_enabled = rerollIsEnabled();

		if (reroll_enabled.result == false) {
			return reroll_enabled;
		}

		if (new PlayerItemIF(player_interface, item_interface).getRerollCost() > user_object.profile.bank_balance) {
			return negativeResponse(PERMISSION_RESPONSES.INSUFFICIENT_FUNDS);
		}

		return POSITIVE_RESPONSE;
	}

	this.canRerollItemAttribute = function(attribute_id) {
		var can_reroll = this.canReroll();

		if (can_reroll.result === false) {
			return can_reroll;
		}

		var unlocked_attributes = item_interface.getAttributes().unlocked;
		for (var i=0; i<unlocked_attributes.length; i++) {
			if (attribute_id == unlocked_attributes[i]._id) {
				return POSITIVE_RESPONSE;
			}
		}

		return negativeResponse(PERMISSION_RESPONSES.LOCKED_ATTRIBUTE);
	}

	this.canChangeActiveUniqueAttribute = function() {
		return rerollIsEnabled();
	}

	this.canSell = function() {
		if (!isOwned()) {
			return negativeResponse(PERMISSION_RESPONSES.NOT_OWNED);
		}

		if (item_interface.isPermanent()) {
			return negativeResponse(PERMISSION_RESPONSES.IS_PERMANENT);
		}

		if (item_interface.isOriginal()) {
			return negativeResponse(PERMISSION_RESPONSES.ORIGINAL_ITEM);
		}

		if (["claimed", "unclaimed", "won"].indexOf(item_interface.getStatus()) == -1) {
			return negativeResponse(PERMISSION_RESPONSES.NOT_ELIGIBLE_FOR_SELLING);
		}

		return POSITIVE_RESPONSE;
	}

	this.canClaim = function() {
		if (!isOwned()) {
			return negativeResponse(PERMISSION_RESPONSES.NOT_OWNED);
		}

		if (["unclaimed", "won"].indexOf(item_interface.getStatus()) == -1) {
			return negativeResponse(PERMISSION_RESPONSES.NOT_ELIGIBLE_FOR_CLAIMING);
		}

		if (player_interface.inventoryIsFull() && !item_interface.isOriginal() && !item_interface.isVintage()) {
			return negativeResponse(PERMISSION_RESPONSES.FULL_INVENTORY);
		}

		return POSITIVE_RESPONSE;
	}

	this.canDecline = function() {
		if (!isOwned()) {
			return negativeResponse(PERMISSION_RESPONSES.NOT_OWNED);
		}

		if (item_interface.getStatus() != "for_sale") {
			return negativeResponse(PERMISSION_RESPONSES.NOT_ELIGIBLE_FOR_DECLINING);
		}

		return POSITIVE_RESPONSE;
	}
	
	this.canPurchase = function() {
		if (!isOwned()) {
			return negativeResponse(PERMISSION_RESPONSES.NOT_OWNED);
		}

		if (item_interface.getStatus() != "for_sale") {
			return negativeResponse(PERMISSION_RESPONSES.NOT_ELIGIBLE_FOR_PURCHASING);
		}
				
		if (!this.canAffordPurchase()) {
			return negativeResponse(PERMISSION_RESPONSES.INSUFFICIENT_FUNDS);
		}

		if (player_interface.inventoryIsFull() && !item_interface.isOriginal() && !item_interface.isVintage()) {
			return negativeResponse(PERMISSION_RESPONSES.FULL_INVENTORY);
		}

		return POSITIVE_RESPONSE;
	}

	this.canAffordPurchase = function() {
		return getItemObjectValueByType(item_interface.getItemObject(), "dealer", user_object._id) <= user_object.profile.bank_balance;
	}

	this.canTag = function() {
		if (!isOwned()) {
			return negativeResponse(PERMISSION_RESPONSES.NOT_OWNED);
		}

		return POSITIVE_RESPONSE;
	}

	this.canTagForSale = function() {
		if (!isOwned()) {
			return negativeResponse(PERMISSION_RESPONSES.NOT_OWNED);
		}

		if (item_interface.isPermanent()) {
			return negativeResponse(PERMISSION_RESPONSES.IS_PERMANENT);
		}

		if (item_interface.getItemObject().tags.indexOf("for sale") != -1) {
			return negativeResponse(PERMISSION_RESPONSES.IS_FOR_SALE);
		}

		if (item_interface.isOriginal()) {
			return negativeResponse(PERMISSION_RESPONSES.ORIGINAL_ITEM);
		}

		if (["auctioned", "archived", "displayed"].indexOf(item_interface.getStatus()) != -1) {
			return negativeResponse(PERMISSION_RESPONSES.NOT_ELIGIBLE_FOR_TAGGING_FOR_SALE);
		}

		return POSITIVE_RESPONSE;
	}

	this.canUntagForSale = function() {
		if (!isOwned()) {
			return negativeResponse(PERMISSION_RESPONSES.NOT_OWNED);
		}

		if (item_interface.getItemObject().tags.indexOf("for sale") == -1) {
			return negativeResponse("item is not currently for sale");
		}

		return POSITIVE_RESPONSE;
	}

	var hasInArchive = function() {
		return getOneFromCollection("PlayerItemPermissions.js:hasInArchive", items, {'owner': player_interface.getId(), 'status': "archived", 'displaced': {$ne: true}, 'artwork_id': item_interface.getArtworkId()}) != undefined;
	}

	this.canQuickDiscard = function(to_archive) {
		if (item_interface.isPermanent()) {
			return negativeResponse(PERMISSION_RESPONSES.IS_PERMANENT);
		}

		if (!player_interface.isActive()) {
			return negativeResponse(PERMISSION_RESPONSES.INACTIVE_PLAYER);
		}

		if (item_interface.isIdentifiedForgery()) {
			return negativeResponse(PERMISSION_RESPONSES.IDENTIFIED_FORGERY);
		}

		if (item_interface.isRepairing()) {
			return negativeResponse(PERMISSION_RESPONSES.IS_REPAIRING);
		}

		var item_types = item_interface.getTypes();
		var qso = user_object.profile.settings.quick_sell_options;
		if (!qso.standard && item_types.indexOf("standard") != -1) {
			return negativeResponse(PERMISSION_RESPONSES.QUICK_DISCARD_OPTIONS);
		}

		if (!qso.foil && item_types.indexOf("foil") != -1) {
			return negativeResponse(PERMISSION_RESPONSES.QUICK_DISCARD_OPTIONS);
		}

		if (!qso.seasonal && item_types.indexOf("seasonal") != -1) {
			return negativeResponse(PERMISSION_RESPONSES.QUICK_DISCARD_OPTIONS);
		}

		if (!qso.unlocked && item_types.indexOf("unlocked") != -1) {
			return negativeResponse(PERMISSION_RESPONSES.QUICK_DISCARD_OPTIONS);
		}

		if (!qso.legendary && item_types.indexOf("legendary") != -1) {
			return negativeResponse(PERMISSION_RESPONSES.QUICK_DISCARD_OPTIONS);
		}

		if (!qso.original && item_types.indexOf("original") != -1) {
			return negativeResponse(PERMISSION_RESPONSES.QUICK_DISCARD_OPTIONS);
		}

		if (!qso.lottery && item_types.indexOf("lottery") != -1) {
			return negativeResponse(PERMISSION_RESPONSES.QUICK_DISCARD_OPTIONS);
		}

		if (!qso.vintage && item_types.indexOf("vintage") != -1) {
			return negativeResponse(PERMISSION_RESPONSES.QUICK_DISCARD_OPTIONS);
		}

		if (!qso.unfound && !hasInArchive() && to_archive === false) {
			return negativeResponse(PERMISSION_RESPONSES.QUICK_DISCARD_OPTIONS);
		}

		if (!qso.quest_items) {
			var item_is_quest_item = getOneFromCollection("PlayerItemPermissions.js:PlayerItemPermissions.canQuickDiscard()", quests, {'owner_id': user_object._id, 'target': {$in: [item_interface.getArtworkId()]}}) != undefined;
			var user_does_not_own = getOneFromCollection("PlayerItemPermissions.js:PlayerItemPermissions.canQuickDiscard()", items, {'artwork_id': item_object.artwork_id, 'owner': user_object._id, 'status': {$nin: ["for_sale", "unclaimed", "won", "auctioned", "archived"]}}) == undefined;
			if (item_is_quest_item && user_does_not_own) {
				return negativeResponse(PERMISSION_RESPONSES.QUICK_DISCARD_OPTIONS);
			}
		}
		
		return POSITIVE_RESPONSE;
	}

	this.canBid = function(amount) {
		if (!player_interface.isActive()) {
			return negativeResponse(PERMISSION_RESPONSES.INACTIVE_PLAYER);
		}

		var auction_object = getOneFromCollection("PlayerItemPermissions.js:PlayerItemPermissions.canBid()", auctions, {'item_id': item_interface.getItemObject()._id});

		if (auction_object == undefined) {
			return negativeResponse("auction not found");
		}

		if (amount < auction_object.min_bid) {
			return negativeResponse(PERMISSION_RESPONSES.INSUFFICIENT_FUNDS);
		}

		if (auction_object.seller == user_object.profile.screen_name) {
			return negativeResponse("you are the seller of this item");
		}

		if (auction_object.viewer == "public") {
			var biddable_rarities = ["common"];

			var player_level = user_object.profile.level;
			if (player_level >= 20)
				biddable_rarities.push("uncommon");

			if (player_level >= 30)
				biddable_rarities.push("rare");

			if (player_level >= 40)
				biddable_rarities.push("legendary");

			if (player_level >= 50)
				biddable_rarities.push("masterpiece");

			if (biddable_rarities.indexOf(auction_object.item_data.rarity) == -1) {
				return negativeResponse(PERMISSION_RESPONSES.INSUFFICIENT_PLAYER_LEVEL);
			}
		}

		var has_auctioneer = user_object.profile.market_expert.expiration > moment()._d.toISOString();
		var auctions_maxed = user_object.profile.auction_data.winning.length >= Math.floor(user_object.profile.auction_cap * (has_auctioneer ? 1.5 : 1));
		var currently_winning = user_object.profile.auction_data.winning.indexOf(auction_object._id) != -1;

		if (auctions_maxed && !currently_winning) {
			return negativeResponse(PERMISSION_RESPONSES.AUCTION_LIMIT_MET);
		}

		if (player_interface.inventoryIsFull() && !item_interface.isOriginal()) {
			return negativeResponse(PERMISSION_RESPONSES.FULL_INVENTORY);
		}

		var available_balance = currently_winning ? user_object.profile.bank_balance + auction_object.current_bid : user_object.profile.bank_balance;
		if (available_balance < auction_object.min_bid) {
			return negativeResponse(PERMISSION_RESPONSES.INSUFFICIENT_FUNDS);
		}

		return POSITIVE_RESPONSE;
	}

	this.canDonate = function() {
		if (item_interface.getStatus() == "for_sale" && !this.canAffordPurchase()) {
			return negativeResponse(PERMISSION_RESPONSES.INSUFFICIENT_FUNDS);
		}

		if (!isOwned()) {
			return negativeResponse(PERMISSION_RESPONSES.NOT_OWNED);
		}

		if (item_interface.isOriginal()) {
			return negativeResponse(PERMISSION_RESPONSES.ORIGINAL_ITEM);
		}

		if (item_interface.isPermanent()) {
			return negativeResponse(PERMISSION_RESPONSES.IS_PERMANENT);
		}

		if (["claimed", "unclaimed", "won", "for_sale"].indexOf(item_interface.getStatus()) == -1) {
			return negativeResponse(PERMISSION_RESPONSES.NOT_ELIGIBLE_FOR_DONATING);
		}

		return POSITIVE_RESPONSE;
	}

	this.canAffordUpgrade = function() {
		if (!player_interface.isActive()) {
			return negativeResponse(PERMISSION_RESPONSES.INACTIVE_PLAYER);
		}

		if (item_interface.getLevel() >= MAX_ITEM_LEVEL) {
			return negativeResponse("this item is already at the maximum item level");
		}

		var upgrade_cost = new PlayerItemIF(player_interface, item_interface).getUpgradeCost();
		var keys = Object.keys(upgrade_cost);
		for (var i=0; i<keys.length; i++) {
			var key = keys[i];
			if (upgrade_cost[key] > user_object.profile.knowledge[key]) {
				return negativeResponse(PERMISSION_RESPONSES.INSUFFICIENT_KNOWLEDGE + " (" + key + ")");
			}
		}

		return POSITIVE_RESPONSE;
	}

	this.canUpgrade = function() {
		var reroll_enabled = rerollIsEnabled();
		if (reroll_enabled.result === false) {
			return reroll_enabled;
		}

		var can_afford_upgrade = this.canAffordUpgrade();
		if (can_afford_upgrade.result === false) {
			return can_afford_upgrade;
		}
		
		return POSITIVE_RESPONSE;
	}

	var getDisplacedArchiveItem = function() {
		var artwork_interface = new ArtworkIF(item_interface.getArtworkObject());

		var query = {
			'_id': {'$ne': item_interface.getId()},
        	'owner': player_interface.getId(),
            'artwork_id': artwork_interface.getId(),
            'status': "archived",
            'displaced': false,
            'archive_signature': item_interface.getArchiveSignature()
        };

        return getOneFromCollection("PlayerItemPermissions.js:getDisplacedArchiveItem", items, query);
	}

	this.canArchive = function() {
		if (item_interface.getStatus() == "for_sale" && !this.canAffordPurchase()) {
			return negativeResponse(PERMISSION_RESPONSES.INSUFFICIENT_FUNDS);
		}

		if (item_interface.isOriginal()) {
			return negativeResponse(PERMISSION_RESPONSES.ORIGINAL_ITEM);
		}
		
		if (player_interface.getUserObject().profile.vintage_select) {
			return negativeResponse(PERMISSION_RESPONSES.NOT_ELIGIBLE_FOR_ARCHIVING);
		}

		//TODO why does this work client-side?!
		if (item_interface.isIdentifiedForgery()) {
			return negativeResponse(PERMISSION_RESPONSES.IDENTIFIED_FORGERY);
		}

		if (item_interface.getStatus() == "archived" && getDisplacedArchiveItem() == undefined) {
			return negativeResponse(PERMISSION_RESPONSES.NOT_ELIGIBLE_FOR_ARCHIVING); 
		}
		
		if (["archived", "claimed", "won", "unclaimed", "for_sale"].indexOf(item_interface.getStatus()) == -1) {
			return negativeResponse(PERMISSION_RESPONSES.NOT_ELIGIBLE_FOR_ARCHIVING);
		}

		return POSITIVE_RESPONSE;
	}

	this.canDelete = function() {
		if (item_interface.isOriginal()) {
			return negativeResponse(PERMISSION_RESPONSES.ORIGINAL_ITEM);
		}

		if (item_interface.isPermanent()) {
			return negativeResponse(PERMISSION_RESPONSES.IS_PERMANENT);
		}

		if (!item_interface.isIdentifiedForgery() && item_interface.getStatus() != "archived") {
			return negativeResponse(PERMISSION_RESPONSES.NOT_ELIGIBLE_FOR_DELETING);
		}

		return POSITIVE_RESPONSE;
	}

	this.canForge = function() {
		if (!isOwned()) {
			return negativeResponse(PERMISSION_RESPONSES.NOT_OWNED);
		}

		if (forgery_contracts.findOne({'owner_id': player_interface.getId()}) == undefined) {
			return negativeResponse("you have no forgery contracts");
		}

		var valid_statuses;
        if (player_interface.procUniqueAttribute("FORGE_FROM_INVENTORY", undefined)) {
            valid_statuses = ["archived", "claimed", "reparing", "displayed"];
        }
        else {
        	valid_statuses = ["archived"];
        }

        if (player_interface.procUniqueAttribute("DEALER_ITEM_FORGERY_DISCOUNT", undefined)) {
            valid_statuses.push("for_sale");
        }

        if (valid_statuses.indexOf(item_interface.getStatus()) == -1) {
        	return negativeResponse(PERMISSION_RESPONSES.NOT_ELIGIBLE_FOR_FORGING);
        }

        return POSITIVE_RESPONSE;
	}

	this.canIdentify = function() {
		if (!isOwned()) {
			return negativeResponse(PERMISSION_RESPONSES.NOT_OWNED);
		}

		if (!isClaimed()) {
			return negativeResponse(PERMISSION_RESPONSES.NOT_CLAIMED);
		}

		var identify_cost = new PlayerItemIF(player_interface, item_interface).getIdentifyCost();
		if (identify_cost > user_object.profile.bank_balance) {
			return negativeResponse(PERMISSION_RESPONSES.INSUFFICIENT_FUNDS);
		}

		if (item_interface.getItemObject().authenticity.identified) {
			return negativeResponse("this item has already been identified");
		}

		return POSITIVE_RESPONSE;
	}

	this.canRedeemForgery = function() {
		if (!isOwned()) {
			return negativeResponse(PERMISSION_RESPONSES.NOT_OWNED);
		}

		if (!isClaimed()) {
			return negativeResponse(PERMISSION_RESPONSES.NOT_CLAIMED);
		}

		if (!item_interface.isForgery() && item_interface.getItemObject().authenticity.identified) {
			return negativeResponse(PERMISSION_RESPONSES.NOT_FORGERY);
		}

		if (item_interface.getItemObject().authenticity.liable == player_interface.getId()) {
			return negativeResponse(PERMISSION_RESPONSES.LIABLE);
		}

		if (item_interface.getItemObject().authenticity.original_owner == player_interface.getId()) {
			return negativeResponse("you are the original owner of this item");
		}

		return POSITIVE_RESPONSE;
	}
}

npc_max_map = {
	'bronze': 120,
	'silver': 100,
	'gold': 80,
	'platinum': 60
};

canMeetNPC = function(npc_id) {
	if (!Meteor.user().profile.active) {
		return {
			'npc_object': undefined,
			'error': "inactive account"
		};
	}

	var npc_object = getOneFromCollection("PlayerItemPermissions.js:PlayerItemPermissions.canMeetNPC()", npcs, npc_id);

	if (npc_object == undefined) {
		return {
			'npc_object': undefined,
			'error': "invalid npc_id"
		};
	}

	if (Meteor.user().profile.npcs_met[npc_object.quality] >= npc_max_map[npc_object.quality]) {
		npcs.update(npc_id, {$push: {'players_met' : Meteor.userId()}});
		if (getOneFromCollection("PlayerItemPermissions.js:PlayerItemPermissions.canMeetNPC()", metadata, {'npc_limit_hits': {$ne: null}}) == undefined) {
			var limit_object = {};
			limit_object[Meteor.user().profile.screen_name] = {};
			limit_object[Meteor.user().profile.screen_name][npc_object.quality] = 1
			metadata.insert({
				'npc_limit_hits': limit_object
			})
		}

		else {
			var limit_object = {};
			var limit_string = 'npc_limit_hits.' + Meteor.user().profile.screen_name + '.' + npc_object.quality;
			limit_object[limit_string] = 1;
			var query = {};
			query[limit_string] = {$ne: null};
			if (getOneFromCollection("PlayerItemPermissions.js:PlayerItemPermissions.canMeetNPC()", metadata, query) == undefined) {
				metadata.update({'npc_limit_hits': {$ne: null}}, {$set: limit_object});
			}

			else metadata.update({'npc_limit_hits': {$ne: null}}, {$inc: limit_object});
		}

		return {
			'npc_object': undefined,
			'error': npc_object.quality + " npc limit reached"
		};
	}

	var can_meet = npc_object.players_met.indexOf(Meteor.userId()) == -1;
	var is_own_npc = npc_object.owner_id == Meteor.userId();
	var can_access_gallery = getOneFromCollection("PlayerItemPermissions.js:PlayerItemPermissions.canMeetNPC()", gallery_tickets, {'ticketholder': Meteor.userId(), 'gallery_owner': npc_object.owner_id}) != undefined;

	var error;
	if (!can_meet)
		error = "npc already met";

	else if (!can_access_gallery && !is_own_npc)
		error = "you do not have access to this npc";

	return {
		'npc_object': (can_meet && (is_own_npc || can_access_gallery)) ? npc_object : undefined,
		'error': error
	};
}