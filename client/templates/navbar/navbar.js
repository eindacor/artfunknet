var quest_tracker = new Tracker.Dependency;
var quest_statuses = {};

var updateQuestStatus = function(quest_id) {
	Meteor.call('canTurnInQuest', quest_id, function(error, result) {
		if (error)
			console.log(error.message)

		else {
			quest_statuses[quest_id] = result;
			quest_tracker.changed();
		}
	});
}


Template.navbar.helpers({
	'screen_name' : function() {
		return Meteor.user().profile.screen_name;
	},

	'ticket' : function() {
		return gallery_tickets.find({'ticketholder': Meteor.userId()});
	},

	'ticketData' : function(ticket_object) {
		var gallery_object = galleries.findOne({'owner_id' : ticket_object.gallery_owner});
		if (gallery_object) {
			var unmet_npcs = npcs.findOne({'owner_id': gallery_object.owner_id, 'players_met': {$ne: Meteor.userId()}});

			if (gallery_object) {
				var displayed_object = {
					'owner_name' : gallery_object.owner,
					'owner_id' : ticket_object.gallery_owner,
					'expiration_string' : getTimeString(moment(ticket_object.expiration)),
					'unmet_npcs' : (unmet_npcs != undefined)
				}

				return displayed_object;
			}

			else return {};
		}
	},

	'hasAlerts' : function() {
		if (Meteor.user() == undefined)
			return false;
		
		return alerts.findOne({'user_id': Meteor.userId()}) !== undefined;
	},

	'hasLoot' : function() {
		return items.findOne({'owner': Meteor.userId(), 'status': {$in: ["unclaimed", "won"]}}) !== undefined;
	},

	'hasForSale' : function() {
		return items.findOne({'owner': Meteor.userId(), 'status': "for_sale"}) !== undefined; 
	},

	'hasVisitors' : function() {
		return npcs.findOne({'owner_id': Meteor.userId(), 'players_met': {$ne: Meteor.userId()}}) !== undefined;
	},

	'hasQuest' : function() {
		return quests.findOne({'owner_id': Meteor.userId()}) !== undefined;
	},

	'hasCompletedQuest' : function() {
		var all_quests = quests.find({'owner_id': Meteor.userId()}).fetch();

		for (var i=0; i<all_quests.length; i++) {
			var quest_object = all_quests[i];
			
			var targets_found = 0;
			for (var c=0; c < quest_object.target.length; c++) {
				if (items.findOne({'artwork_id': quest_object.target[c], 'owner': Meteor.userId(), 'status': {$nin: ['unclaimed', 'for_sale', 'won']}}) != undefined)
					targets_found++;
			}

			if (targets_found >= quest_object.min_requirement)
				return true;
		};

		return false;
	},

	'hasFullyCompletedQuest' : function() {
		var all_quests = quests.find({'owner_id': Meteor.userId()}).fetch();

		for (var i=0; i<all_quests.length; i++) {
			var quest_object = all_quests[i];
			
			var targets_found = 0;
			for (var c=0; c < quest_object.target.length; c++) {
				if (items.findOne({'artwork_id': quest_object.target[c], 'owner': Meteor.userId(), 'status': {$nin: ['unclaimed', 'for_sale', 'won']}}) != undefined)
					targets_found++;
			}

			if (targets_found == quest_object.target.length)
				return true;
		};

		return false;
	},

	'notifications': function() {
		return Meteor.user().profile.notifications;
	},

	'isNegative': function(amount) {
		return amount < 0;
	}
})

Template.navbar.events({
	'mouseover .nav-icon' : function(element) {
		var button_title = element.target.dataset.title;

		setFootnote(button_title, Math.floor(Math.random() * 1000));
	},

	'mouseover .ticket-button i' : function(element) {
		var owner_name = element.target.dataset.owner_name;
		var expiration_string = element.target.dataset.expiration_string;
		setFootnote("Visit gallery of " + owner_name + ". Expires " + expiration_string + ".", Math.floor(Math.random() * 100000));
	},
})

Template.navbar.rendered = function() {
	$('.notification').bind('afterShow', function() {
		console.log("detected");
	})
}

jQuery(function($) {
	$('.notification').bind('isV')
});