AuctionIF = function(auction) {
	this.auction_id;
	this.auction_object;
    this.made_from_object = (typeof auction !== "string");

    this.auction_object = this.made_from_object ? auction : getOneFromCollection("AuctionIF.js:AuctionIF - " + auction, auctions, {'_id': auction});

    if (this.auction_object == undefined) {
		throw "invalid auction: " + auction;
	}

    this.auction_id = this.auction_object._id;

    if (this.auction_id == undefined) {
        throw "invalid auction: " + auction;
    }

    this.artwork_interface = undefined;

    this.getItemId = function() {
    	return this.auction_object.item_id;
    }

    this.getArtworkInterface = function() {
    	if (this.artwork_interface === undefined) {
            this.artwork_interface = new ArtworkIF(this.auction_object.item_data.artwork_id);
    	}

    	return this.artwork_interface;
    }

    this.getId = function() {
    	return this.auction_id;
    }
}