(function(){
  function initCarousel(root){
    var slides=root.querySelectorAll("img[data-slide]");
    var dots=root.querySelectorAll(".dot");
    if(!slides.length)return;
    var i=0,timer=null,paused=false;
    function show(n){
      i=(n+slides.length)%slides.length;
      slides.forEach(function(s,x){s.classList.toggle("is-active",x===i);});
      dots.forEach(function(d,x){d.classList.toggle("is-active",x===i);});
      var next=slides[(i+1)%slides.length];
      if(next && next.getAttribute("data-src") && !next.getAttribute("src")){
        next.setAttribute("src", next.getAttribute("data-src"));
      }
    }
    function tick(){if(!paused)show(i+1);}
    function start(){timer=setInterval(tick,4200);}
    function stop(){if(timer){clearInterval(timer);timer=null;}}
    dots.forEach(function(d,x){d.addEventListener("click",function(){show(x);stop();start();});});
    root.addEventListener("mouseenter",function(){paused=true;});
    root.addEventListener("mouseleave",function(){paused=false;});
    show(0);start();
  }
  document.addEventListener("DOMContentLoaded",function(){
    document.querySelectorAll("[data-carousel]").forEach(initCarousel);
  });
})();
