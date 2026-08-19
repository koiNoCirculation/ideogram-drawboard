顶层界面设计: 
配色：蓝色+白色
index.tsx: 
应用首页，分左右两边栏，左边栏占1/3, 从上到下显示最近的设计列表，先用"A lone sailboat on calm water at sunset.", "A medium-shot photograph of a barista pouring latte art in a cozy cafe", "an isometric illustration of a tiny city floating in the clouds"占位。右边占2/3, 从上到下为：标题: "Enter the description of your dreamed image", 然后是横向排布的：1. 长宽比列表：有4:3, 3:4, 16:9, 16:10, 9:16,10:16, 1:1, 以及custom。2. 画布长度文本标签，画布长度文本框（只允许数字），3. 画布宽度文本标签， 4. 画布宽度文本框。之后下方为文本框, 默认占位符为: "a golden retriever on a skateboard"。文本框默认占满剩余区域。最下方为按钮：开始设计。

开始设计按钮逻辑：取文本框中内容为prompt，如果长宽比列表选择了custom，则长宽比直接为 `${长}:${宽}`, 否则取选择的长宽比，两者作为参数传递给refine方法生成json prompt. prompt的结果作为参数传递给design.tsx. 
长宽比列表逻辑：选择custom外的长宽比后，在长度输入数字，则宽度自动按照长宽比变化（取整），在宽度输入数字，则长度也会自动按照长宽比变化（取整），当选择了custom，则长和宽的文本框数字的变化不再互相关联。

design.tsx:
用户设计图片的页面，分左右两边蓝，左边栏为工具栏，由图标组成，目前有2个工具：添加文字(使用T字的图标)，添加对象(使用一个照片的图标)。右边自上到下显示一个标题（可编辑），显示一个画布。

index.tsx为默认页面，导航逻辑为：点击开始设计，进入design.tsx. design.tsx点击返回回到index.tsx.
