Template.navbar.helpers({
	'screen_name' : function() {
		return Meteor.user().profile.screen_name;
	},

	'ticket' : function() {
		try {
			var tickets = Meteor.user().profile.gallery_tickets;
			var ticket_array = [];
			for (var i=0; i < tickets.length; i++) {
				var gallery_object = galleries.findOne({'owner_id' : tickets[i].owner_id});
				if (gallery_object) {
					var unmet_npcs = npcs.find({'owner_id': gallery_object.owner_id, 'players_met': {$ne: Meteor.userId()}}).count();

					if (gallery_object) {
						var ticket_object = {
							'owner_name' : gallery_object.owner,
							'owner_id' : tickets[i].owner_id,
							'expiration_string' : getTimeString(moment(tickets[i].expiration)),
							'unmet_npcs' : unmet_npcs > 0
						}
						ticket_array.push(ticket_object);
					}
				}
			}

			return ticket_array;
		}

		catch(error) {
			console.log(error.message);
			return [];
		}
	},

	'hasAlerts' : function() {
		if (Meteor.user() == undefined)
			return false;
		
		return alerts.findOne({'user_id': Meteor.userId()}) !== undefined;
	},

	'hasLoot' : function() {
		return items.findOne({'owner': Meteor.userId(), 'status': "unclaimed"}) !== undefined;
	},

	'hasForSale' : function() {
		return items.findOne({'owner': Meteor.userId(), 'status': "for_sale"}) !== undefined; 
	},

	'hasVisitors' : function() {
		return npcs.findOne({'owner_id': Meteor.userId(), 'players_met': {$ne: Meteor.userId()}}) !== undefined;
	}
})

Template.navbar.events({
	'mouseover .nav-icon' : function(element) {
		var button_title = element.target.dataset.title;

		setFootnote(button_title, Math.floor(Math.random() * 1000));
	}
})