var drop_count = 6;
var drop_frequency = 10800000; //once every 3 hours

dailyDropIsEnabled = function() {
	if (Meteor.user()) {
		var last_drop = Meteor.user().profile.last_drop;
		return (moment() - moment(last_drop) > drop_frequency);
	}

	else return false;
}

getPlayerItemPermissions = function(user_id, item_id) {
	try {
		var user_object = Meteor.users.findOne(user_id);
		var item_reader = new ItemReader(item_id);
		return new PlayerItemPermissions(user_object, item_reader);
	}

	catch (error) {
		return undefined;
	}
}

PlayerItemPermissions = function(user_object, item_reader) {
	if (user_object == undefined)
		throw "invalid user";

	var isOwned = function() {
		return user_object != undefined && item_reader.getOwnerId() == user_object._id;
	}

	var isOwnedAndClaimed = function() {
		var owned = isOwned();
		var claimed_status = item_reader.getStatus() == "claimed";

		return owned && claimed_status;
	}

	this.getItemReader = function() {
		return item_reader;
	}

	this.getUserObject = function() {
		return user_object;
	}

	this.canDisplay = function() {
		if (isOwnedAndClaimed()) {
			return items.find({'owner' : user_object._id, 'status' : "displayed"}).count() < user_object.profile.display_cap;
		}

		else return false;
	}

	this.canAuction = function() {
		if (isOwnedAndClaimed()) {
			var has_auctioneer = user_object.profile.market_expert.expiration > moment()._d.toISOString();
			return items.find({'owner' : user_object._id, 'status' : "auctioned"}).count() < Math.floor(user_object.profile.auction_cap * (has_auctioneer ? 1.5 : 1));
		}

		else return false;
	}

	this.canSetPermanent = function() {
		if (isOwnedAndClaimed()) {
			return items.find({'owner' : user_object._id, 'status' : "permanent"}).count() < user_object.profile.pc_cap;
		}

		else return false;
	}

	this.canUnsetPermanent = function() {
		if (isOwned()) {
			return item_reader.getStatus() == "permanent";
		}

		else return false;
	}

	var rerollIsEnabled = function() {
		if (isOwned()) {
			var status = item_reader.getStatus();

			if (status == "claimed")
				return true;

			var bypass_statuses = ["displayed", "permanent"];
			if (bypass_statuses.indexOf(status) != -1) {
				return procUniqueAttribute(user_object._id, "REROLL_DISPLAY_ENABLE", "Designer");
			}

			return false;
		}

		else return false;
	}

	this.canReroll = function() {
		if (rerollIsEnabled()) {
			var reroll_cost = item_reader.getRerollCost();

			if (procUniqueAttribute(user_object._id, "REROLL_DISCOUNT", undefined)) {
	            reroll_cost = Math.floor(reroll_cost * .75);
	        }

			return reroll_cost <= user_object.profile.bank_balance;
		}

		else return false;
	}

	this.canRerollItemAttribute = function(attribute_id) {
		if (this.canReroll()) {
			var unlocked_attributes = item_reader.getAttributes().unlocked;

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
			var status = item_reader.getStatus();
			return valid_statuses.indexOf(status) != -1;
		}

		else return false;
	}

	this.canClaim = function() {
		if (isOwned()) {
			var valid_statuses = ["unclaimed", "won"];
			var status = item_reader.getStatus();

			if (valid_statuses.indexOf(status) == -1)
				return false;

			return !inventoryIsFull(user_object) || item_reader.isOriginal();
		}
		
		else return false;
	}

	this.canDecline = function() {
		if (isOwned()) {
			return item_reader.getStatus() == "for_sale";
		}

		else return false;
	}
	
	this.canPurchase = function() {
		if (isOwned()) {
			if (item_reader.getStatus() != "for_sale")
				return false;

			if (getItemObjectValueByType(item_reader.getItemObject(), "dealer", user_object._id) > user_object.profile.bank_balance)
				return false;

			return !inventoryIsFull(user_object) || item_reader.isOriginal();
		}

		else return false;
	}

	this.canTag = function() {
		return isOwned();
	}

	this.canQuickDiscard = function() {
		var item_types = item_reader.getTypes();

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

		if (!qso.unfound && playerHasNotOwned(user_object, item_reader.getId()))
			return false;

		if (!qso.quest_items) {
			var item_is_quest_item = quests.findOne({'owner_id': user_object._id, 'target': {$in: [item_reader.getArtworkId()]}}) != undefined;
			var user_does_not_own = items.findOne({'_id': item_reader.getId(), 'owner': user_object._id}) == undefined;
			if (item_is_quest_item && user_does_not_own)
				return false;
		}
		
		return true;
	}

	this.canBid = function(amount) {
		var auction_object = auctions.findOne({'item_id': item_reader.getItemObject()._id});
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
}

canTurnInQuest = function(quest_id) {
	var quest_object = quests.findOne(quest_id);
	if (quest_object == undefined || quest_object.target == undefined || quest_object.target.length == 0)
		return false;

	if (quest_object.owner_id != Meteor.userId())
		return false;

	var targets_found = 0;
	for (var i=0; i<quest_object.target.length; i++) {
		if (items.findOne({'artwork_id': quest_object.target[i], 'owner': Meteor.userId(), 'status': {$nin: ['unclaimed', 'for_sale', 'won']}}) != undefined)
			targets_found++;
	}

	return targets_found >= quest_object.min_requirement;
}

npc_max_map = {
	'bronze': 120,
	'silver': 100,
	'gold': 80,
	'platinum': 60
};

canMeetNPC = function(npc_id) {
	var npc_object = npcs.findOne(npc_id);

	if (npc_object == undefined) {
		return {
			'npc_object': undefined,
			'error': "invalid npc_id"
		};
	}

	if (Meteor.user().profile.npcs_met[npc_object.quality] >= npc_max_map[npc_object.quality]) {
		npcs.update(npc_id, {$push: {'players_met' : Meteor.userId()}});
		if (metadata.findOne({'npc_limit_hits': {$ne: null}}) == undefined) {
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
			if (metadata.findOne(query) == undefined) {
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
	var can_access_gallery = gallery_tickets.findOne({'ticketholder': Meteor.userId(), 'gallery_owner': npc_object.owner_id}) != undefined;

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

canPurchaseTicket = function() {
	return gallery_tickets.find({'ticketholder': Meteor.userId()}).count() < Meteor.user().profile.ticket_cap;
}
