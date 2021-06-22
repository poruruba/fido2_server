const methods_bootstrap = {
    dialog_open: function(target, backdrop = 'static'){
        $(target).modal({backdrop: backdrop, keyboard: false});
    },
    dialog_close: function(target){
        $(target).modal('hide');
    },
    panel_open: function(target){
        $(target).collapse("show");
    },
    panel_close: function(target){
        $(target).collapse("hide");
    },
    progress_open: function(title = '少々お待ちください。', backdrop){
        this.$root.progress_title = title;
        this.dialog_open('#progress', backdrop);
    },
    progress_close: function(){
        this.dialog_close('#progress');
    },
    tab_select: function(target){
        $("a[href='" + target + "']").tab("show").show();
    },
    toast_show: function(message, title, level = "info", option){
        toastr[level](message, title, option);
    },
    clip_paste: async function(){
    	return navigator.clipboard.readText();
    },
    clip_copy: async function(text){
    	return navigator.clipboard.writeText(text);
    },
    datgui_add: function (property, p1, p2, p3) {
        var ctrl = window.datgui.add(this, property, p1, p2, p3);
        this.$watch(property, (v) => ctrl.setValue(v));
    },
    datgui_addColor: function (property) {
        var ctrl = window.datgui.addColor(this, property);
        this.$watch(property, (v) => ctrl.setValue(v));
    },
};

const mixins_bootstrap = {
    methods: methods_bootstrap
}
