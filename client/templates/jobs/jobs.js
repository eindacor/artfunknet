var selected_job_tracker = new Tracker.Dependency;
var selected_job;

var job_target_tracker = new Tracker.Dependency;
var job_target_info;

var completed_tracker = new Tracker.Dependency;
var completed_map = {};

var job_count_tracker = new Tracker.Dependency;
var active_jobs;

var job_progress_tracker = new Tracker.Dependency;
var job_progress_map = {};

Template.jobs.helpers({
	'job' : function() {
		return quests.find({'owner_id': Meteor.userId()});
	},

	'selected_job': function() {
		selected_job_tracker.depend();
		return selected_job;
	},

	'max_jobs': function() {
		return DEFAULT_JOB_LIMIT;
	},

	'active_jobs': function() {
		job_count_tracker.depend();
		if (active_jobs == undefined) {
			Meteor.call('getActiveQuests', function(error, result) {
				if (error) {
					console.log(error.message);
				}
				else {
					active_jobs = result;
					job_count_tracker.changed();
				}
			})
		}
		return active_jobs;
	}
})

Template.jobTargets.rendered = function() {
	job_target_info = undefined;
	job_target_tracker.changed();
}

Template.jobTargets.helpers({
	'getJobTargetInfo': function(job_object) {
		job_target_tracker.depend();
		selected_job_tracker.depend();

		if (job_target_info == undefined) {
			Meteor.call('getJobTargetInfo', job_object, function(error, result) {
				if (error) {
					console.log(error.message);
				}
				else {
					job_target_info = result;
					job_target_tracker.changed();
				}
			})
		}
		return job_target_info;
	},

	'job_stub': function(artwork_object) {
		var item_data = {
			'artwork_id': artwork_object._id,
			'artwork_data': artwork_object,
			'level': 1
		}

		return item_data;
	}
})

Template.jobs.rendered = function() {
	selected_job = undefined;
	job_target_info = undefined;
	completed_map = {};
	active_jobs = undefined;

	job_progress_map = {};
	job_progress_tracker.changed();
}

Template.jobListItem.events({
	'click .job-container': function(event) {
		var job_id = $(event.target).closest('.job-container').attr("data-job_id");
		selected_job = selected_job && selected_job._id == job_id ? undefined : quests.findOne(job_id);
		job_target_info = undefined;
		selected_job_tracker.changed();
	},

	'click .job-button': function(event) {
		event.stopPropagation();
		var job_id = $(event.target).closest('.job-container').attr('data-job_id');
		var action_name = $(event.target).closest('.job-button').attr('data-action_name');
		Meteor.call(action_name, job_id, function(error) {
			if (error) {
				console.log(error.message);
			}
			else {
				job_target_info = undefined;
				if (selected_job && job_id == selected_job._id) {
					selected_job = undefined;
					selected_job_tracker.changed();
				}
				active_jobs = undefined;
				job_count_tracker.changed();
			}
		})
	}
})

Template.jobListItem.helpers({
	'selected_job': function() {
		selected_job_tracker.depend();
		return selected_job;
	},

	'job_progress': function(job_id) {
		job_progress_tracker.depend();
		if (job_progress_map[job_id] == undefined) {
			Meteor.call('getJobProgress', job_id, function(error, result) {
				if (error) {
					console.log(error.message);
				}
				else {
					job_progress_map[job_id] = result;
					job_progress_tracker.changed();
				}
			})
		}
		return job_progress_map[job_id];
	}
})