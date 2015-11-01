Template.galleryTable.helpers({
	'header' : function(table_data) {
		var header_array = [
			{ 'text' : 'owner', 'sort_id' : 'owner', 'table_id' : table_data.table_id  },
			{ 'text' : 'attributes', 'sort_id' : undefined, 'table_id' : table_data.table_id  },
			{ 'text' : 'entry fee', 'sort_id' : 'entry_fee', 'table_id' : table_data.table_id  },
			{ 'text' : 'current visitors', 'sort_id' : undefined, 'table_id' : table_data.table_id  },
		];

		return header_array;
	},

	'galleryData' : function() {
		var table_id = "galleries";

		var sort_query = {};

		if (Session.get(table_id + '_sort')) {
			var asc = (Session.get(table_id + '_ascending') ? 1 : -1);
		    sort_query[Session.get(table_id + '_sort')] = asc;
		}

		//required for pagination
		var pagination_id = 'galleries';

		if (Session.get(pagination_id + '_current') === undefined)
			Session.set(pagination_id + '_current', 0);

		var pageData = {
			'identifier': pagination_id,
			'totalResults': Meteor.users.find({}).count(),
			'resultsPerPage': 10,
			'pageNumbersDisplayed': 7,
		}

		var skip_amount = Number(pageData.resultsPerPage * Session.get(pagination_id + '_current'));

		//var gallery_array = Meteor.users.find( {}, { sort: sort_query, skip: skip_amount, limit: pageData.resultsPerPage } ).fetch();
		var gallery_array = galleries.find( {}, { sort: sort_query, skip: skip_amount, limit: pageData.resultsPerPage } ).fetch();

		if (gallery_array.length < Number(pageData.resultsPerPage * Session.get(pagination_id + '_current')))
			Session.set('pagination_id' + '_current', Session.get(pagination_id + '_current') - 1);
		
		return {
			'table_data' : {
				'gallery' : gallery_array,
				'table_id' : table_id,
			},	
			'pageData' : pageData
		}
	},

	'galleryInfo' : function(gallery_object) {
		try {
			gallery_object.current_visitors = 10;

			var attribute_array = [];
			var gallery_details = gallery_object.attribute_values;
			var attribute_ids = Object.keys(gallery_object.attribute_values);

			for (var i=0; i < attribute_ids.length; i++) {
				var attribute_object = attributes.findOne(attribute_ids[i]);
				if (attribute_object.type == "secondary")
					continue;
				
				attribute_object.value = gallery_object.attribute_values[attribute_ids[i]];
				attribute_array.push(attribute_object);
			}

			gallery_object.attribute = attribute_array;
			gallery_object.fee_text = getCommaSeparatedValue(gallery_object.entry_fee);
			gallery_object.paid = gallery_object.owner_id == Meteor.userId() || Meteor.users.findOne({'_id': Meteor.userId(), 'profile.gallery_tickets.owner_id': gallery_object.owner_id}) != undefined;
			return gallery_object;
		}

		catch(error) {
			console.log(error);
			return {};
		}
	}
});

Template.galleryTable.events({
	'mouseover .gallery-attribute' : function(element) {
		var attribute_id = element.target.dataset.attribute_id;
		var value = Math.floor(Number(element.target.dataset.attribute_value) * 100);
		var description = element.target.dataset.attribute_description;
		var hover_string = "level " + value + " " + description;
		setFootnote(hover_string, 4);
	},

	'click .gallery-row' : function(element) {
		var owner = $(element.target).closest('.gallery-row').data().owner;
		Router.go('/user/' + owner);	
	}
})

Template.galleryHeaderTemplate.helpers({
	'sorted' : function() {
		var table_id = this.table_id;
		return {
			'sort' : Session.get(table_id + '_sort') == this.sort_id,
			'ascending' : Session.get(table_id + '_ascending')
		}
	}
})

Template.galleryHeaderTemplate.events({
	'click th': function(element) {
		var sort = $(element.target).closest('.table-header').data('sort');
		var table_id = $(element.target).closest('.gallery-table').data('table_id');

		if (sort && Session.get(table_id + '_sort')) {
			var ascending = (Session.get(table_id + '_sort') != sort ? true : !Session.get(table_id + '_ascending'));
			Session.set(table_id + '_ascending', ascending);
			Session.set(table_id + '_sort', sort);
		}
	}
})

Template.galleries.rendered = function() {
	Session.set('galleries_ascending', true);
	Session.set('galleries_sort', "profile.screen_name");
}