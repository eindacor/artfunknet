Template.auctions.helpers({
	'auctionData' : function() {
		var table_id = "main_auctions";

		var sort_query = {};

		if (Session.get(table_id + '_sort')) {
			var asc = (Session.get(table_id + '_ascending') ? 1 : -1);
		    sort_query[Session.get(table_id + '_sort')] = asc;
		}

		//required for pagination
		var pagination_id = 'main_auctions';

		if (Session.get(pagination_id + '_current') === undefined)
			Session.set(pagination_id + '_current', 0);

		var pageData = {
			'identifier': pagination_id,
			'totalResults': auctions.find({}).count(),
			'resultsPerPage': 10,
			'pageNumbersDisplayed': 7,
		}

		var skip_amount = Number(pageData.resultsPerPage * Session.get(pagination_id + '_current'));

		var auction_array = auctions.find( {}, { sort: sort_query, skip: skip_amount, limit: pageData.resultsPerPage } ).fetch();

		if (auction_array.length < Number(pageData.resultsPerPage * Session.get(pagination_id + '_current')))
			Session.set('pagination_id' + '_current', Session.get(pagination_id + '_current') - 1);
		
		return {
			'tableData' : {
				'auction' : auction_array,
				'table_id' : table_id,
			},	
			'pageData' : pageData
		}
	},
});

Template.auctions.rendered = function() {
	Session.set('main_auctions_ascending', true);
	Session.set('main_auctions_sort', "expiration_date");
}