var drop_count = 6;
var drop_frequency = 10800000; //once every 3 hours

dailyDropIsEnabled = function() {
	if (Meteor.user()) {
		var last_drop = Meteor.user().profile.last_drop;
		return (moment() - moment(last_drop) > drop_frequency);
	}

	else return false;
}

PlayerItemPermissions = function(player_interface, item_interface) {
	var user_object = player_interface.getUserObject();
	var item_object = item_interface.getItemObject();

	var isOwned = function() {
		return player_interface.isActive() && item_interface.getOwnerId() == user_object._id;
	}

	var isOwnedAndClaimed = function() {
		var owned = isOwned();
		var claimed_status = item_interface.getStatus() == "claimed";

		return owned && claimed_status;
	}

	this.getItemIF = function() {
		return item_interface;
	}

	this.getUserObject = function() {
		return user_object;
	}

	var artworkIsAlreadyPermanentOrDisplayed = function() {
		return player_interface.isActive() && getOneFromCollection("PlayerItemPermissions.js:PlayerItemPermissions.artworkIsAlreadyPermanentOrDisplayed()", items, {'owner': user_object._id, 'status': {$in: ["displayed", "permanent"]}, 'artwork_id': item_object.artwork_id}) != undefined;
	}

	this.canDisplay = function() {
		if (isOwnedAndClaimed() && !artworkIsAlreadyPermanentOrDisplayed()) {
			return getFromCollection("PlayerItemPermissions.js:PlayerItemPermissions.canDisplay()", items, {'owner' : user_object._id, 'status' : "displayed"}).count() < user_object.profile.display_cap;
		}

		else return false;
	}

	this.canUndisplay = function() {
		if (isOwned()) {
			return item_interface.getStatus() == "displayed";
		} 
	}

	this.canAuction = function() {
		if (isOwnedAndClaimed()) {
			var has_auctioneer = user_object.profile.market_expert.expiration > moment()._d.toISOString();
			return getFromCollection("PlayerItemPermissions.js:PlayerItemPermissions.canAuction()", items, {'owner' : user_object._id, 'status' : "auctioned"}).count() < Math.floor(user_object.profile.auction_cap * (has_auctioneer ? 1.5 : 1));
		}

		else return false;
	}

	this.canSetPermanent = function() {
		if (isOwnedAndClaimed() && !artworkIsAlreadyPermanentOrDisplayed()) {
			return getFromCollection("PlayerItemPermissions.js:PlayerItemPermissions.canSetPermanent()", items, {'owner' : user_object._id, 'status' : "permanent"}).count() < user_object.profile.pc_cap;
		}

		else return false;
	}

	this.canUnsetPermanent = function() {
		if (isOwned()) {
			return item_interface.getStatus() == "permanent";
		}

		else return false;
	}

	var rerollIsEnabled = function() {
		if (isOwned()) {
			var status = item_interface.getStatus();

			if (status == "claimed")
				return true;

			var bypass_statuses = ["displayed", "permanent"];
			if (bypass_statuses.indexOf(status) != -1) {
				return procUniqueAttribute(user_object._id, "REROLL_DISPLAY_ENABLE", "Marketing Manager");
			}

			return false;
		}

		else return false;
	}

	this.canReroll = function() {
		if (rerollIsEnabled()) {
			var reroll_cost = item_interface.getRerollCost();

			if (procUniqueAttribute(user_object._id, "REROLL_DISCOUNT", undefined)) {
	            reroll_cost = Math.floor(reroll_cost * .75);
	        }

			return reroll_cost <= user_object.profile.bank_balance;
		}

		else return false;
	}

	this.canRerollItemAttribute = function(attribute_id) {
		if (this.canReroll()) {
			var unlocked_attributes = item_interface.getAttributes().unlocked;

			for (var i=0; i<unlocked_attributes.length; i++) {
				if (attribute_id == unlocked_attributes[i]._id)
					return true;
			}

			return false;
		}

		else return false;
	}

	this.canChangeActiveUniqueAttribute = function() {
		return rerollIsEnabled();
	}

	this.canSell = function() {
		if (isOwned()) {
			var valid_statuses = ["claimed", "unclaimed", "won"];
			var status = item_interface.getStatus();
			return valid_statuses.indexOf(status) != -1;
		}

		else return false;
	}

	this.canClaim = function() {
		if (isOwned()) {
			var valid_statuses = ["unclaimed", "won"];
			var status = item_interface.getStatus();

			if (valid_statuses.indexOf(status) == -1)
				return false;

			return !inventoryIsFull(user_object) || item_interface.isOriginal();
		}
		
		else return false;
	}

	this.canDecline = function() {
		if (isOwned()) {
			return item_interface.getStatus() == "for_sale";
		}

		else return false;
	}
	
	this.canPurchase = function() {
		if (isOwned()) {
			if (item_interface.getStatus() != "for_sale")
				return false;

			if (getItemObjectValueByType(item_interface.getItemObject(), "dealer", user_object._id) > user_object.profile.bank_balance)
				return false;

			return !inventoryIsFull(user_object) || item_interface.isOriginal();
		}

		else return false;
	}

	this.canTag = function() {
		return isOwned();
	}

	this.canQuickDiscard = function() {
		if (!player_interface.isActive())
			return false;

		var item_types = item_interface.getTypes();

		var qso = user_object.profile.settings.quick_sell_options;
		if (!qso.standard && item_types.indexOf("standard") != -1)
			return false;

		if (!qso.foil && item_types.indexOf("foil") != -1)
			return false;

		if (!qso.seasonal && item_types.indexOf("seasonal") != -1)
			return false;

		if (!qso.unlocked && item_types.indexOf("unlocked") != -1)
			return false;

		if (!qso.legendary && item_types.indexOf("legendary") != -1)
			return false;

		if (!qso.original && item_types.indexOf("original") != -1)
			return false;

		if (!qso.lottery && item_types.indexOf("lottery") != -1)
			return false;

		if (!qso.vintage && item_types.indexOf("vintage") != -1)
			return false;

		if (!qso.unfound && playerHasNotOwned(user_object, item_interface.getId()))
			return false;

		if (!qso.quest_items) {
			var item_is_quest_item = getOneFromCollection("PlayerItemPermissions.js:PlayerItemPermissions.canQuickDiscard()", quests, {'owner_id': user_object._id, 'target': {$in: [item_interface.getArtworkId()]}}) != undefined;
			var user_does_not_own = getOneFromCollection("PlayerItemPermissions.js:PlayerItemPermissions.canQuickDiscard()", items, {'artwork_id': item_object.artwork_id, 'owner': user_object._id, 'status': {$nin: ["for_sale", "unclaimed", "won", "auctioned"]}}) == undefined;
			if (item_is_quest_item && user_does_not_own)
				return false;
		}
		
		return true;
	}

	this.canBid = function(amount) {
		if (!player_interface.isActive())
			return false;

		var auction_object = getOneFromCollection("PlayerItemPermissions.js:PlayerItemPermissions.canBid()", auctions, {'item_id': item_interface.getItemObject()._id});
		var bidder_object = user_object;

		if (auction_object == undefined || amount < auction_object.min_bid)
        	return false;

		if (auction_object.seller == bidder_object.profile.screen_name)
			return false;

		if (auction_object.viewer == "public") {
			var biddable_rarities = ["common"];

			var player_level = bidder_object.profile.level;
			if (player_level >= 20)
				biddable_rarities.push("uncommon");

			if (player_level >= 30)
				biddable_rarities.push("rare");

			if (player_level >= 40)
				biddable_rarities.push("legendary");

			if (player_level >= 50)
				biddable_rarities.push("masterpiece");

			if (biddable_rarities.indexOf(auction_object.item_data.rarity) == -1) {
				return false;
			}
		}

		var has_auctioneer = bidder_object.profile.market_expert.expiration > moment()._d.toISOString();
		var auctions_maxed = user_object.profile.auction_data.winning.length >= Math.floor(user_object.profile.auction_cap * (has_auctioneer ? 1.5 : 1));
		var currently_winning = user_object.profile.auction_data.winning.indexOf(auction_object._id) != -1;
		var item_is_original = auction_object.item_data.original;

		if (auctions_maxed && !currently_winning) 
			return false;

		if (inventoryIsFull(user_object) && !item_is_original)
			return false;

		var available_balance = currently_winning ? bidder_object.profile.bank_balance + auction_object.current_bid : bidder_object.profile.bank_balance;

		return available_balance >= auction_object.min_bid;
	}

	this.canDonate = function() {
		if (isOwned()) {
			var valid_statuses = ["claimed", "unclaimed", "won"];
			var status = item_interface.getStatus();
			return valid_statuses.indexOf(status) != -1;
		}

		else return false;
	}

	this.canAffordUpgrade = function() {
		if (!player_interface.isActive())
			return false;

		if (item_interface.getLevel() < MAX_ITEM_LEVEL) {
			var upgrade_cost = item_interface.getUpgradeCost();
			var keys = Object.keys(upgrade_cost);
			for (var i=0; i<keys.length; i++) {
				var key = keys[i];
				if (upgrade_cost[key] > user_object.profile.knowledge[key]) {
					return false;
				}
			}

			return true;
		}

		else return false;
	}

	this.canUpgrade = function() {
		return rerollIsEnabled() && this.canAffordUpgrade();
	}
}

npc_max_map = {
	'bronze': 120,
	'silver': 100,
	'gold': 80,
	'platinum': 60
};

canMeetNPC = function(npc_id) {
	if (!Meteor.user().active)
		return false;

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