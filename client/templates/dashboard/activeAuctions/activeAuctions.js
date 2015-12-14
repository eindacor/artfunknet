Template.activeAuctions.helpers({
	'myAuctions' : function() {
		var table_id = "my_auctions";

		var sort_query = {};

		if (Session.get(table_id + '_sort')) {
			var asc = (Session.get(table_id + '_ascending') ? 1 : -1);
		    sort_query[Session.get(table_id + '_sort')] = asc;
		}

	    var auction_array = auctions.find({'seller' : Meteor.user().profile.screen_name}, {sort: sort_query}).fetch();

		return {
			'auction' : auction_array,
			'table_id' : table_id
		}

	},

	'myBids' : function() {
		var table_id = "my_bids";

		var sort_query = {};

		if (Session.get(table_id + '_sort')) {
			var asc = (Session.get(table_id + '_ascending') ? 1 : -1);
		    sort_query[Session.get(table_id + '_sort')] = asc;
		}

	    var auction_array = auctions.find({'_id': {$in: Meteor.user().profile.auction_data.watching}}, {sort: sort_query}).fetch();

		return {
			'auction' : auction_array,
			'table_id' : table_id
		}
	},

});

Template.activeAuctions.rendered = function() {
	Session.set('my_bids_ascending', true);
	Session.set('my_bids_sort', "expiration_date");
	Session.set('my_auctions_ascending', true);
	Session.set('my_auctions_sort', "expiration_date");
}