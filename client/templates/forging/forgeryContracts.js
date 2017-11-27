var selected_forgery_contract_tracker = new Tracker.Dependency;
var selected_forgery_contract_id;

getSelectedForgeryContractIdTracker = function() {
	return selected_forgery_contract_tracker;
}

getSelectedForgeryContractId = function() {
	return selected_forgery_contract_id;
}

setSelectedForgeryContractId = function(selected_id) {
	selected_forgery_contract_id = selected_id;
}

Template.forgeryContracts.helpers({
	'forgery_contract': function() {
		return forgery_contracts.find({'owner_id': Meteor.userId()});
	},

	'selected_forgery_contract_id': function() {
		selected_forgery_contract_tracker.depend();
		return getSelectedForgeryContractId();
	}
})

Template.forgeryContracts.events({
	'click .forgery-contract-container.unselected': function(event) {
		var forgery_contract_id = $(event.target).closest('.forgery-contract-container.unselected').data().forgery_contract_id;
		setSelectedForgeryContractId(forgery_contract_id);
		selected_forgery_contract_tracker.changed();
	},

	'click .forgery-contract-container.selected': function(event) {
		setSelectedForgeryContractId(undefined);
		selected_forgery_contract_tracker.changed();
	},

	'click #discard-forgery': function() {
		if (selected_forgery_contract_id != undefined) {
			Meteor.call('discardForgeryContract', selected_forgery_contract_id, function(error) {
				if (error) {
					console.log(error);
				}

				else {
					setSelectedForgeryContractId(undefined);
					selected_forgery_contract_tracker.changed();
				}
			})
		}
	}
})