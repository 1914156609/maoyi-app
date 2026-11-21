<template>
  <div class="app-container">
    <el-row :gutter="15">
      <el-form ref="formRef" :model="formData" :rules="rules" size="default" label-width="100px">
        <el-col :span="24">
          <el-row justify="center" align="middle" :gutter="15">
            <el-col :span="24">
              <el-form-item label="单行文本" prop="field103">
                <el-input v-model="formData.field103" type="text" placeholder="请输入单行文本" clearable
                  :style="{width: '100%'}"></el-input>
              </el-form-item>
            </el-col>
            <el-col :span="24">
              <el-form-item label="按钮" prop="field102">
                <el-button type="primary" icon="Search" size="default"> 主要按钮 </el-button>
              </el-form-item>
            </el-col>
          </el-row>
        </el-col>
        <el-col :span="24">
          <el-form-item label="颜色选择" prop="field104" required>
            <el-color-picker v-model="formData.field104" size="default"></el-color-picker>
          </el-form-item>
        </el-col>
        <el-col :span="12">
          <el-form-item label-width="120px" label="单行文本" prop="field105">
            <el-input v-model="formData.field105" type="text" placeholder="QA输入" clearable
              prefix-icon='Search' suffix-icon='Check' :style="{width: '100%'}">
              <template #prepend>￥</template>
              <template #append>元</template>
            </el-input>
          </el-form-item>
        </el-col>
        <el-col :span="24">
          <el-form-item>
            <el-button type="primary" @click="submitForm">提交</el-button>
            <el-button @click="resetForm">重置</el-button>
          </el-form-item>
        </el-col>
      </el-form>
    </el-row>
  </div>
</template>
<script setup>
const {
  proxy
} = getCurrentInstance()
const formRef = ref()
const data = reactive({
  formData: {
    field103: undefined,
    field102: undefined,
    field104: "#409eff",
    field105: undefined,
  },
  rules: {
    field103: [{
      required: true,
      message: "请输入单行文本",
      trigger: 'blur'
    }],
    field105: [{
      required: true,
      message: "QA输入",
      trigger: 'blur'
    }],
  }
})
const {
  formData,
  rules
} = toRefs(data)
/**
 * @name: 表单提交
 * @description: 表单提交方法
 * @return {*}
 */
function submitForm() {
  formRef.value.validate((valid) => {
    if (!valid) return
    // TODO 提交表单
  })
}
/**
 * @name: 表单重置
 * @description: 表单重置方法
 * @return {*}
 */
function resetForm() {
  formRef.value.resetFields()
}

</script>
<style>
</style>
