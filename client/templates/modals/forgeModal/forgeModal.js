var selected_forgery_contract_tracker = new Tracker.Dependency;
var selected_forgery_contract_id;

Template.forgeModal.helpers({
	'contract_count': function() {
		return forgery_contracts.find({'owner_id': Meteor.userId()}).count();
	},

	'forgery_contract': function() {
		return forgery_contracts.find({'owner_id': Meteor.userId()});
	},

	'selected_forgery_contract_id': function() {
		selected_forgery_contract_tracker.depend();
		return selected_forgery_contract_id;
	}
})

Template.forgeModal.events({
	'click .forgery-contract-container.unselected': function(event) {
		var forgery_contract_id = $(event.target).closest('.forgery-contract-container.unselected').data().forgery_contract_id;
		selected_forgery_contract_id = forgery_contract_id;
		selected_forgery_contract_tracker.changed();
	},

	'click .forgery-contract-container.selected': function(event) {
		selected_forgery_contract_id = undefined;
		selected_forgery_contract_tracker.changed();
	},

	'click #discard-forgery': function() {
		if (selected_forgery_contract_id != undefined) {
			Meteor.call('discardForgeryContract', selected_forgery_contract_id, function(error) {
				if (error) {
					console.log(error);
				}

				else {
					selected_forgery_contract_id = undefined;
					selected_forgery_contract_tracker.changed();
				}
			})
		}
	},

	'click #forge-item': function(event) {
		var item_id = $(event.target).data().item_id;
		if (selected_forgery_contract_id != undefined) {
			Meteor.call('forgeItem', item_id, selected_forgery_contract_id, function(error) {
				if (error) {
					console.log(error);
				}

				selected_forgery_contract_id = undefined;
				selected_forgery_contract_tracker.changed();
			})
		}
	}
})

Template.forgeModal.rendered = function() {
	selected_forgery_contract_id = undefined;
}