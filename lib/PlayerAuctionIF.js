PlayerAuctionIF = function(player_interface, auction_interface) {
	this.user_id = player_interface.getId();
	this.item_id = auction_interface.getItemId();

	this.player_item_interface = undefined;
	this.permissions = undefined;
	this.item_interface = undefined;

	this.getItemIF = function() {
		if (this.item_interface === undefined) {
			this.item_interface = new ItemIF(this.item_id);
		}

		return this.item_interface;
	}

	this.getPlayerItemIF = function() {
		if (this.player_item_interface === undefined) {
			this.player_item_interface = new PlayerItemIF(player_interface, this.getItemIF());
		}

		return this.player_item_interface;
	}

	this.getPermissions = function() {
		if (this.permissions === undefined) {
			this.permissions = new PlayerItemPermissions(player_interface, this.getItemIF());
		}

		return this.permissions;
	}

	this.canBid = function(amount) {
		return this.getPermissions().canBid(amount);
	}

	this.getRecommendedStatus = function() {
		return this.getPlayerItemIF().getRecommendedStatus();
	}

	this.getIsUnclaimed = function() {
		return items.findOne({'owner': this.user_id, 'artwork_id': auction_interface.getArtworkInterface().getId(), 'status': {$in: ['unclaimed', 'won']}}) != undefined;
	}

	this.getIsOwned = function() {
        return items.findOne({'owner': this.user_id, 'artwork_id': auction_interface.getArtworkInterface().getId(), 'status': {$nin: ['unclaimed', 'for_sale', 'won', 'archived']}}) != undefined;
	}
}