var drop_count = 6;
var drop_frequency = 10800000; //once every 3 hours

dailyDropIsEnabled = function() {
	if (Meteor.user()) {
		var last_drop = Meteor.user().profile.last_drop;
		return (moment() - moment(last_drop) > drop_frequency);
	}

	else return false;
}

itemIsOwnedAndClaimed = function(item_id) {
	var item_object = items.findOne(item_id);
	var owned = Meteor.userId() && item_object && item_object.owner == Meteor.userId();
	var claimed_status = item_object && item_object.status == "claimed";

	return owned && claimed_status ? item_object : undefined;
}

canDisplayItem = function(item_id) {
	var item_object = itemIsOwnedAndClaimed(item_id);
	var can_display = items.find({'owner' : Meteor.userId(), 'status' : "displayed"}).count() < Meteor.user().profile.display_cap;
	return can_display ? item_object : undefined;
}

canAuctionItem = function(item_id) {
	var item_object = itemIsOwnedAndClaimed(item_id);
	var has_auctioneer = Meteor.user().profile.market_expert.expiration > moment()._d.toISOString();
	var can_auction = items.find({'owner' : Meteor.userId(), 'status' : "auctioned"}).count() < Math.floor(Meteor.user().profile.auction_cap * (has_auctioneer ? 1.5 : 1));
	return can_auction ? item_object : undefined; 
}

canSetPermanent = function(item_id) {
	var item_object = itemIsOwnedAndClaimed(item_id);
	var under_cap = items.find({'owner' : Meteor.userId(), 'status' : "permanent"}).count() < Meteor.user().profile.pc_cap;
	return under_cap ? item_object : undefined;
}

canUnsetPermanent = function(item_id) {
	var item_object = items.findOne(item_id);
	var owned = item_object && item_object.owner == Meteor.userId();
	return owned ? item_object : undefined;
}

canRerollItem = function(item_id) {
	var item_object = items.findOne(item_id);
	var item_owned = Meteor.userId() && item_object && item_object.owner == Meteor.userId();
	var can_afford = getRerollCost(item_id) <= Meteor.user().profile.bank_balance;
	var unique_bypass = procUniqueAttribute(Meteor.userId(), "REROLL_DISPLAY_ENABLE", "Designer");
	var valid_status = item_object.status == "claimed" || unique_bypass;
	return can_afford && item_owned && valid_status ? item_object : undefined;
}

canSellItem = function(item_id) {
	var item_object = items.findOne(item_id);
	var owned = Meteor.userId() && item_object && item_object.owner == Meteor.userId();
	var status_ok = item_object && (item_object.status == "claimed" || item_object.status == "unclaimed" || item_object.status == "won");
	return owned && status_ok ? item_object : undefined;
}

canClaimItem = function(item_id) {
	var item_object = items.findOne(item_id);
	var owned = Meteor.userId() && item_object && item_object.owner == Meteor.userId();
	var status_ok = item_object && (item_object.status == "unclaimed" || item_object.status == "won");
	var not_full = !inventoryIsFull(Meteor.user()) || item_object.original;
	return owned && status_ok && not_full ? item_object : undefined;
}

canDeclineItem = function(item_id) {
	var item_object = items.findOne(item_id);
	var owned = Meteor.userId() && item_object && item_object.owner == Meteor.userId();
	var status_ok = item_object && item_object.status == "for_sale";
	return owned && status_ok ? item_object : undefined;
}

canPurchaseItemFromDealer = function(item_id) {
	var item_object = items.findOne(item_id);
	var owned = Meteor.userId() && item_object && item_object.owner == Meteor.userId();
	var status_ok = item_object && item_object.status == "for_sale";
	 //TODO add legendary procs for dealer amounts here
	var can_afford = Meteor.userId() && getItemValue(item_id, "dealer", item_object.owner) <= Meteor.user().profile.bank_balance;
	var not_full = !inventoryIsFull(Meteor.user()) || item_object.original;;
	return owned && status_ok && can_afford && not_full ? item_object : undefined;
}

canSellToCollector = function(item_id) {
	var item_object = items.findOne(item_id);
	var owned = Meteor.userId() && item_object && item_object.owner == Meteor.userId();
	var status_ok = item_object && (item_object.status == "claimed" || item_object.status == "permanent");
	return owned && status_ok ? item_object : undefined;
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

canMeetNPC = function(npc_id) {
	var npc_object = npcs.findOne(npc_id);

	if (npc_object == undefined)
		return false;

	var can_meet = npc_object.players_met.indexOf(Meteor.userId()) == -1;
	var is_own_npc = npc_object.owner_id == Meteor.userId();
	var can_access_gallery = gallery_tickets.findOne({'ticketholder': Meteor.userId(), 'gallery_owner': npc_object.owner_id}) != undefined;

	return (can_meet && (is_own_npc || can_access_gallery));
}

canBidOnItem = function(auction_id) {
	var auction_object = auctions.findOne(auction_id);
	var bidder_object = Meteor.user();

	if (auction_object == undefined)
		return false;

	if (auction_object.seller == bidder_object.profile.screen_name)
		return false;

	var has_auctioneer = bidder_object.profile.market_expert.expiration > moment()._d.toISOString();
	var auctions_maxed = Meteor.user().profile.auction_data.winning.length >= Math.floor(Meteor.user().profile.auction_cap * (has_auctioneer ? 1.5 : 1));
	var currently_winning = Meteor.user().profile.auction_data.winning.indexOf(auction_id) != -1;
	var item_is_original = auction_object.item_data.original;

	if (auctions_maxed && !currently_winning) 
		return false;

	if (inventoryIsFull(Meteor.user()) && !item_is_original)
		return false;

	var available_balance = currently_winning ? bidder_object.profile.bank_balance + auction_object.highest_bid : bidder_object.profile.bank_balance;

	return available_balance >= auction_object.min_bid;
}
